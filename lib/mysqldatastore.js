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

var assert = require('assert'); 
    dbmysql = require('db-mysql'),
    genericPool = require('generic-pool'),
    bind = require('./bindparse.js'),
    confBuilder = require('./confbuilder.js'),
    dnsSupport = require('./dnssupport.js');

var mysqlConnPool = genericPool.Pool({
  name: 'mysql',
  max: 20,
  create: function(callback) {
    new dbmysql.Database({
      hostname: conf.mysql.host,
      user:     conf.mysql.username,
      pass:     conf.mysql.password,
      database: conf.mysql.database,
    }).connect(function(error, server) {
      callback(error, this);
    });
  },
  destroy: function(db) {
    db.disconnect();
  }
});

/*
  Fetch records from the mysql name server database,
  returning the ones that match given the query domain
  type. Results returned as an array of objects.
*/
exports.fetchRecord = function(conf, domain, type, callback) {
  var type = dnsSupport.getValidType(type);
  
  //the object returned. need to return zone for it has the ttl and stuff
  var responseObject = {
    response: [],
    zone: {}
  };
  
  var completeResponse = function() {
    //get the data from mysql table and give to callback
    mysqlConnPool.acquire(function(error, db) {
      if (error) throw Error('Unable to connect to database: ' + error);
      
      var query = db.query().select('*').from( conf.mysql.tables.zones.name );
      
      query.execute(function(error, rows, cols) {
        mysqlConnPool.release(db);
        
        if (error) throw Error('Unable to fetch record from database: ' + error);
        
        responseObject.zone = rows[0];
        callback(responseObject);
      });

    });
  };
  
  /*
    TODO add some mechanism to narrow the esults returned for each query,
    by comparing the zone domain and the query domain? Perhaps not possible
    since the record owner needs to be compared to the query domain
  */
  
  //get the data from mysql table and give to callback
  mysqlConnPool.acquire(function(error, db) {
    if (error) throw Error('Unable to connect to database: ' + error);
    
    var query = db.query().select( '*' ).from( conf.mysql.tables[type].name );
    
    query.execute( function(error, rows, cols) {
      mysqlConnPool.release(db);
      
      if (error) throw Error('Unable to fetch record from database: ' + error);
      
      //adds the records where domain, zone, and owner all match up according to BIND specs
      responseObject.response = rows.filter(function(row) { return dnsSupport.compareDomains(domain, row.zone.toString(), row.owner.toString()) });
      completeResponse(); //finish by adding the zone in another async call, then return the object
    });
  });
}

/*
  Reads the named.conf to build zone objects which are
  then added to the appropriate Mysql tables. This is
  or backwards compatability with named.conf/bind server
  setups.
  
  Note, the tables will be updated asynchronously. 
  TODO add a synchronous function as well.
*/
exports.importFromBind = function(serverConfPath, bindConfPath) {
  confBuilder.build(serverConfPath, function(serverConf) {
    if (typeof(bindConfPath) == 'undefined') {
      bind.parse(serverConf.bind.confPath, function(bindConf) {
        finishImport(serverConf, bindConf);
      });
    } else {
      bind.parse(bindConfPath, function(bindConf) {
        finishImport(serverConf, bindConf);
      });
    }
  });
};

/*
  Helper function for importFromBind,
  finishes the import once the bindConf is built
*/
var finishImport = function(serverConf, bindConf) {
  //iterate over the zones returned in the bindConf object
  Object.keys(bindConf.zones).forEach(function(zoneDomain) {
    var zone = bindConf.zones[zoneDomain];
    
    zone.records.forEach(function(record) {
      var rows = [];
      
      // if an SOA record is encountered, use it to add the
      // zones record to the table
      if ( dnsSupport.getValidType(record.type) == 'soa' ) {
        rows = formatRecord('zones', zoneDomain, record.rr);
        addRecordToDatabase(serverConf, 'zones', rows);
      }
      
      //add the other records
      rows = formatRecord( dnsSupport.getValidType(record.type), zoneDomain, record.rr, record.owner );
      addRecordToDatabase(serverConf, dnsSupport.getValidType(record.type), rows);
    });
  });
};

var addRecordToDatabase = function(conf, type, tableRows) {
  assert.equal(conf.mysql.tables[type].columns.length, tableRows.length, 'Number of rows does not match number of columns for insert');
  
  var tableName = conf.mysql.tables[type].name;
  var tableColumns = conf.mysql.tables[type].columns
  
  mysqlConnPool.acquire(function(error, db) {
    if (error) throw Error('Unable to connect to database: ' + error);
    
    var query = db.query().insert( tableName, tableColumns, tableRows );
    
    query.execute(function(error, response) {
      mysqlConnPool.release(db);
    
      if (error) throw Error('Unable to query database: ' + error);
    });
  });
};

var formatRecord = function(type, zoneDomain, recordString, recordOwner) {
  //checks to see if recordString is a string representation, to avoid splitting on white space
  var data = recordString.match(/^".*"$/) ? [recordString] : recordString.split(/\s+/);

  if (type == 'zones') {
    return [
      zoneDomain, //domain
      data[0], //name server
      data[1], //host email
      data[2].match(/\(?(\d+)/)[1], //serial
      data[3], //refresh
      data[4], //retry
      data[5], //expire
      data[6].match(/(\d+)\)?/)[1] //minimum ttl
    ];
  }
  
  if (type == 'soa') {
    return [
      zoneDomain, //zone
      data[0], //name server
      data[1], //host email
      data[2].match(/\(?(\d+)/)[1], //serial
      data[3], //refresh
      data[4], //retry
      data[5], //expire
      data[6].match(/(\d+)\)?/)[1], //minimum ttl
      recordOwner
    ];
  }
  
  if (type == 'a') {
    return [
      zoneDomain,
      data[0], //address
      recordOwner
    ];
  }
  
  if (type == 'mx') {
    return [
      zoneDomain,
      data[0], //preference
      data[1], //exchange
      recordOwner
    ];
  }
  
  if (type == 'ns') {
    return [
      zoneDomain,
      data[0], //server
      recordOwner
    ];
  }
  
  if (type == 'cname') {
    return [
      zoneDomain,
      data[0], //cname
      recordOwner
    ];
  }
  
  if (type == 'txt') {
    return [
      zoneDomain,
      data[0], //text
      recordOwner
    ];
  }
  
  throw Error('Unable to format record for table insertion');
};

