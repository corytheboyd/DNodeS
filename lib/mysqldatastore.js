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
    confBuilder = require('./confbuilder.js'),
    dnsSupport = require('./dnssupport.js');

/*
  Connection pool used to distribute mysql connections
  so as not to flood and break it.
*/
var mysqlConnPool = null;

/*
	Create the connection pool for the configuration file.
*/
var createConnectionPool = function(conf) {
	mysqlConnPool = genericPool.Pool({
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
};

/*
  Fetch records from the mysql name server database,
  returning the ones that match given the query domain
  type. Results returned as an array of objects.
*/
var fetchRecords = exports.fetchRecords = function(conf, domain, type, callback) {
	if (!mysqlConnPool) createConnectionPool(conf);
	
  var type = dnsSupport.getValidType(type);
  
  //the object returned. need to return zone for it has the ttl and stuff
	// record = {
	// 		type: "a",
	// 		content: "1.2.3.4",
	// 		name: "www",
	// 		priority: null,
	// 		ttl: 1337
	// };
	
  //get the data from mysql table and pass to callback
  mysqlConnPool.acquire(function(error, db) {
    if (error) throw Error('Unable to connect to database: ' + error);
    
    var query = db.query("SELECT " + conf.mysql.tables.records.columns.record_type + " AS type, " + 
												conf.mysql.tables.records.columns.content + " AS content, " + 
												conf.mysql.tables.records.columns.name + " AS name, " + 
												conf.mysql.tables.records.columns.priority + " AS priority, " + 
												conf.mysql.tables.records.columns.ttl + " AS ttl FROM " + 
												conf.mysql.tables.records.name + ", " + conf.mysql.tables.domains.name + 
												" WHERE " + conf.mysql.tables.domains.columns.name + "=" + "'" + domain + 
												"' AND + " + conf.mysql.tables.records.columns.record_type + "='" + type + "'");
    
    query.execute( function(error, rows, cols) {
      mysqlConnPool.release(db);
      
      if (error) throw Error('Unable to fetch record from database: ' + error);

			callback(rows);
    });
  });
};

var addRecordToDatabase = function(conf, type, tableRows) {
	//make sure table exists. if not, create it
	checkOrCreateTableForType(conf, type);

  var tableName = conf.mysql.tables[type].name;
  var tableColumns = conf.mysql.tables[type].columns

	assert.equal(tableColumns.length, tableRows.length, 'Number of rows does not match number of columns for insert');
  
  mysqlConnPool.acquire(function(error, db) {
    if (error) throw Error('Unable to connect to database: ' + error);
    
    var query = db.query().insert( tableName, tableColumns, tableRows );
    
    query.execute(function(error, response) {
      mysqlConnPool.release(db);
    
      if (error) throw Error('Unable to query database: ' + error);
    });
  });
};

/*
	Check to see if a table exists in the database,
	and creates the table from the statement set in the
	configuration file if not found.
	
	Note: this method is synchronous so as to make it useful.
*/
var checkOrCreateTableForType = function(conf, type) {
	type = dnsSupport.getValidType(type); //first, validate the type
	
	var createTableStatement = conf.mysql.tables[type].createTable;
	
	mysqlConnPool.acquire(function(error, db) {
		if (error) throw Error('Unable to connect to database: ' + error);
		
		//executes the specified create table statement, releases db connection when done
		db.query(createTableStatement).execute(function() {
			mysqlConnPool.release(db);
    
      if (error) throw Error('Unable to create table ' + conf.mysql.tables[type].name + ': ' + error);
		}, {async: false});
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

