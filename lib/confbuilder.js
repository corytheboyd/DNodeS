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
    assert = require('assert'),
    mysqlDataStore = require('./mysqldatastore.js');

var build = exports.build = function(path, callback) {
  fs.readFile(path, 'utf8', function(error, confData) {
    if (error) throw Error('Unable to read configuation file ' + path );

		//If unable to parse config, return null object
		try {
			var conf = JSON.parse(confData); //read the conf file in from JSON string file
		} catch(error)  {
			console.log('Unable to parse configuration file: ' + error);
			
			callback(null);
			return;
		}

    //OPTIONS
    assert.ok(conf.options.host, 'Host must not be empty');
    assert.ok(typeof(conf.options.port) == 'number', 'Port invalid');
    assert.ok(conf.options.port, 'Port must not be empty');
    
    assert.ok(conf.mysql.host, 'Host must not be blank');
    assert.ok(conf.mysql.username, 'Username must be present');
    assert.ok(conf.mysql.database, 'Database must be present');
    
		conf.fetchRecords = mysqlDataStore.fetchRecords;
		
    callback(conf);
  });
};

var parseBool = function(bool) {
  if (typeof(bool) == 'boolean') return bool;
  return bool.toLowerCase() in { 'true':1, 't':1, 'yes':1, 'y':1 } ? true : false;
};
