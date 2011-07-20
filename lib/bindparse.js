/*
Copyright (c) 2011 Cory Boyd

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), 
to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, 
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR 
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, 
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var fs = require('fs'),
    assert = require('assert');

var confFilePath = './zone_files/named.conf';
var supportedClauses = {'options':1, 'zone':1};
var conf; //store the configuration object once created

exports.parse = function(confFilePath, callback) {
  _buildConfObject(function(tconf) { //build config without zone records...
    _addRecordsToZones(tconf, function(conf) { //read the zone configs to add records, return the completed config object
      callback(conf);
    }); 
  });
};

var _addRecordsToZones = function(conf, callback) {
  var count = 0; //keep track of number of zone records added
  
  /*
    Helper function to build response completely
    before handing to callback
  */
  var buildResponse = function(entries, zone) {
    conf.zones[zone.domain].records = entries;
    count++;
    
    if (count == Object.keys(conf.zones).length) { //if the last record was added, return
      callback(conf);
    }
  };

  Object.keys(conf.zones).forEach(function(zoneDomain) {
    var records = [];
    var zone = conf.zones[zoneDomain];
    
    fs.readFile(zone.path, 'utf8', function(error, zoneData) {
      if (error) throw Error('Unable to read zone file ' + zone.path);
      
      var entries = []; //where the zone info is stored
      var previousOwner; //to set previous owner if left blank
      var addNextLine = false; //if a line continue found, set to true
      var tempEntry; //store an entry temporarily if line is continued
      
      zoneData.split("\n").forEach(function(line) {
        if (zone.ttl && line.match(/^\$TTL?\s+(.*)$/i)) {
          zone.ttl = parseInt( line.match(/^\$TTL?\s+(.*)$/i)[1] );
        }
      
        var commentIndex = line.search(/;/); //remove comment if found on the end of line
        if( commentIndex > 0 ) {
          line = line.slice(0, commentIndex)
        }

        if (!addNextLine && line) {
          var rawData = line.match(/^(\S*)\s+(\S+)\s+(\S+)\s+(.*?)$/);
          
          if(rawData) {
            var entry = {
              owner: rawData[1],
              class: rawData[2],
              type: rawData[3],
              rr: rawData[4],
            };
            
            if( entry.owner.match(/^\s*$/) ) entry.owner = previousOwner;
                          
            //check for line continue, prepare for it next iteration
            if ( entry.rr.match(/.*\($/) ) {
              addNextLine = true;
              tempEntry = entry;
            } else {
              //entry is complete, push it to entries
              entries.push(entry);
            }
            
            previousOwner = entry.owner;
          }
        } else if (line) { //line is continued by a '('
          var tempLine = line.match(/^\s*(.*?)\s*$/);
          if(tempLine) {
            val = tempLine[1];
            
            var parenLine = val.match(/^(.*?)\s*\)\s*$/)
            if( parenLine ) {
              val = parenLine[1];
              
              addNextLine = false;
              tempEntry.rr += val + ')';
              entries.push(tempEntry);
            } else {
              tempEntry.rr += val + ' ';
            }
          }
        }
      });
      buildResponse(entries, zone); //helper function to build response before returning anything
    }); //end fs.read()...
  }); //end forEach( zone )...
};

var _buildConfObject = function(callback) {
  fs.readFile(confFilePath, 'utf8', function(error, confData) {
    if (error) throw new Error('Unable to read configuration file ' + confFilePath);

    var confObject = {
      options: {
        'listen-on': {
          port: 53,
          match: 'any',
        },
        'allow-query': {
          match: 'any',
        },
        'allow-transfer': {
          match: 'none',
        },
        'recursion': false,
      },
      
      zones: {},
    };
    
    var braceCount = 0;
    var tempStatement = ''; //store statement string temporarily
    var currClause = ''; //track the current clause
    
    /*
      0. Ged rid of comments
      1. Read single word, check if valid clause.
      2. If valid clause, capture all of the statements within.
      3. Collect data from the statement string through regex and modify confObject
      4. return the confObject
    */
    
    var newConfData = '';
    confData.split('\n').forEach(function(line) {
      var indexOfComment = line.indexOf(';;');

      indexOfComment > 0 ? newConfData += line.slice(0, indexOfComment) : line;      
    });
    
    var confArr = confData.split(/\s+/).filter(function(e) {return e != ''});
    for ( var i in confArr ) {
      if (confArr[i].match(/\{/)) braceCount++;
      if (confArr[i].match(/\};?/)) braceCount--;
      
      if (!currClause) { //if no clause read yet
        if (confArr[i] in supportedClauses) { //read clause, check if supported
          currClause = confArr[i];
        } else {
          throw Error('Invalid clause: ' + confArr[i]);
        }
      } else { //valid clause is set, do something with it
        if ( currClause == 'options' ) { //if it's an option clause, read until brace count hits zero again
          tempStatement += tempStatement ? ' ' + confArr[i] : confArr[i];
          if (braceCount == 0) {
            currClause = ''; //reset clause
            _parseOptionString(tempStatement, confObject); //parses the option string and sets values in confObject
            tempStatement = '';
          }
        } else if ( currClause == 'zone' ) { //brace count no longer zero
          tempStatement += tempStatement ? ' ' + confArr[i] : confArr[i];
          if (confArr[i].match(/\};/)) {
            currClause = '';
            _parseZoneString(tempStatement, confObject);
            tempStatement = '';
          }
        }
      }
    }
    
    callback(confObject); //return the confObject
  });
};

/*
Take a string representation of the contents of the
zone clause and parse meaningful data from it.
*/
var _parseZoneString = function(str, obj) {
  var data;
  if ( data = str.match(/"(.*?)"\s+in\s+\{\s*type\s+(.*?);\s+file\s+"(.*?)";\s*\};/) ) {
    assert.equal(data.length, 4, "zone statement must have domain, type, and file path");
    
    obj.zones[ data[1] ] = {
      domain: data[1],
      type: data[2],
      path: data[3],
      records: [],
    };
  }    
};

/*
Take a string representation of the contents of the
option clause and parse it to set options.

TODO: add more options, make it so if an option
  doesn't exist in th object it is added. what
  options do people actually use? some of the
  implemented options may need some added robustness,
  as they may come in various forms.
*/
var _parseOptionString = function(str, obj) {
  var data; //temp var to store match data

  //LISTEN-ON PARSE
  if ( data = str.match(/listen-on\s+port\s+(\d+)\s+\{\s*(.*?);\s*\};/) ) {
    assert.equal(data.length, 3, "listen-on requires port and address matching block");
    
    obj.options['listen-on'].port = data[1];
    obj.options['listen-on'].match = data[2];
  }

  //ALLOW-QUERY PARSE
  if ( data = str.match(/allow-query\s+\{\s*(.*?);\s*\};/) ) {
    assert.equal(data.length, 2, "allow-query requires query matching block");

    obj.options['allow-query'].match = data[1];
  }

  //ALLOW-TRANSFER PARSE
  if ( data = str.match(/allow-transfer\s+\{\s*(.*?);\s*\};/) ) {
    assert.equal(data.length, 2, "allow-transfer requres block");
    
    obj.options['allow-transfer'].match = data[1];
  }

  //RECURSION PARSE
  if ( data = str.match(/recursion\s+(.*?);/) ) {
    assert.equal(data.length, 2, "recursion requires single yes/no value");
    obj.options['recursion'] = data[1].toLowerCase() == 'no' ? false : true;
  }
};
