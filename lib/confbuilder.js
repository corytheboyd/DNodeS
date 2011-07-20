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
    mysqlDataStore = require('./mysqldatastore.js'),
    bindDataStore = require('./binddatastore.js');

var validTypes = { 'a':1, 'ns':1, 'cname':1, 'txt':1, 'mx':1 };

exports.build = function(path, callback) {
  fs.readFile(path, 'utf8', function(error, confData) {
    if (error) throw Error('Unable to read configuation file ' + path );

    conf = JSON.parse(confData); //read the conf file in from JSON string file
    
    //OPTIONS
    conf.options.dataStoreMethod = conf.options.dataStoreMethod.toLowerCase(); //normalzie the string for easy comparison
    assert.ok(conf.options.host, 'options: host must not be empty');
    assert.ok(typeof(conf.options.port) == 'number', 'options: port must be an integer');
    assert.ok(conf.options.port, 'options: port must not be empty');
    assert.ok(conf.options.dataStoreMethod, 'options: dataStore must not be empty');
    
    if ( conf.options.dataStoreMethod == 'mysql' ) {
      assert.ok(conf.mysql.host, 'mysql: host must not be blank');
      assert.ok(conf.mysql.username, 'mysql: username must not be blank');
      assert.ok(conf.mysql.database, 'mysql: database must not be blank');
      
      conf.fetchRecord = mysqlDataStore.fetchRecord;
    } else if ( conf.options.dataStoreMethod == 'bind' ) {
      assert.ok(fs.statSync(conf.bind.confPath), 'bind: unable to access file ' + conf.bind.confPath);
      
      conf.fetchRecord = bindDataStore.fetchRecord;
    } else {
      throw Error('options: Invalid dataStore');
    }
    
    callback(conf);
  });
};

