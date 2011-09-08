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

var sys = require('sys'),
    dgram = require('dgram'),
		fs = require('fs'),
    dnsSupport = require('./lib/dnssupport.js'),
    confBuilder = require('./lib/confbuilder.js');

const CONFIG_PATH = './dnsserver.conf'; //the path to the configuration file
var conf = null; //stores the configuration object, which is built when the server starts

var server = dgram.createSocket('udp4');

server.on('message', function(msg, rinfo) {
  var query = dnsSupport.processRequest(msg);
  dnsSupport.sendResponse(conf, query, server, rinfo);
});

/*
  Watches the configuration file for changes, and updates the object
  when needed. The server host and port cannot be changed while the
  server is running
*/
fs.watchFile(CONFIG_PATH, { persistent: true, interval: 5 }, function(curr, prev) {
  confBuilder.build(CONFIG_PATH, function(newConf) {
		if (!newConf) return;
		
    if (conf.options.host != newConf.options.host) console.log('Note: the server host will not be changed until the server is restarted.');
    if (conf.options.port != newConf.options.port) console.log('Note: the server port will not be changed until the server is restarted.');
  
    conf = newConf; //store the configration object
  });
});

// -------------------------------------------

/*
 * Build the configuration file, then start the server
 */
confBuilder.build(CONFIG_PATH, function(newConf) {
	if (!newConf) throw Error('Need valid configuration to start server');
	
  conf = newConf; //store the configration object globally

  server.bind(conf.options.port, conf.options.host);
  
  console.log('Started server on ' + conf.options.host + ':' + conf.options.port );
});