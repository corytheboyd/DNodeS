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
  dnsSupport = require('./lib/dnssupport.js'),
  responseHandler = require('./lib/responsehandler.js'),
  confBuilder = require('./lib/confbuilder.js');

configPath = './dnsserver.conf'; //the path to the configuration file
conf = null; //stores the configuration object, which is built when the server starts

var server = dgram.createSocket('udp4');

server.on('message', function(msg, rinfo) {
  var query = processRequest(msg);
  sendResponse(query, rinfo);
});

var processRequest = function(req) {
  //see rfc1035 for details on what the hell is happening down there
  //http://tools.ietf.org/html/rfc1035#section-4.1.1

  var query = {
    header: {},
    question: {},
  };

  var tmpSlice;
  var tmpByte;

  query.header.id = req.slice(0,2);

  tmpSlice = req.slice(2,3);
  tmpByte = tmpSlice.toString('binary', 0, 1).charCodeAt(0);

  query.header.qr = dnsSupport.sliceBits(tmpByte, 0,1);
  query.header.opcode = dnsSupport.sliceBits(tmpByte, 1,4);
  query.header.aa = dnsSupport.sliceBits(tmpByte, 5,1);
  query.header.tc = dnsSupport.sliceBits(tmpByte, 6,1);
  query.header.rd = dnsSupport.sliceBits(tmpByte, 7,1);

  tmpSlice = req.slice(3,4);
  tmpByte = tmpSlice.toString('binary', 0, 1).charCodeAt(0);

  query.header.ra = dnsSupport.sliceBits(tmpByte, 0,1);
  query.header.z = dnsSupport.sliceBits(tmpByte, 1,3);
  query.header.rcode = dnsSupport.sliceBits(tmpByte, 4,4);
  query.header.qdcount = req.slice(4,6);
  query.header.ancount = req.slice(6,8);
  query.header.nscount = req.slice(8,10);
  query.header.arcount = req.slice(10, 12);

  query.question.qname = req.slice(12, req.length - 4);
  query.question.qtype = req.slice(req.length - 4, req.length - 2);
  query.question.qclass = req.slice(req.length - 2, req.length);

  return query;
};

var sendResponse = function(query, rinfo) {
  var domain = dnsSupport.bufferToDomain( query.question.qname );
  var type = dnsSupport.bufferToNumber( query.question.qtype );
  
  //fetch record from the specified datastore
  conf.fetchRecord(conf, domain, type, function(record) {
  
    var respObject = responseHandler.create(conf, query, type, record);
    var buf = responseHandler.createResponseBuffer(respObject);
    
    server.send(buf, 0, buf.length, rinfo.port, rinfo.address, function (err, sent) {
      if (err) {
        console.log( "Unable to send response to: " + rinfo.address + ":" + rinfo.port );
      } else {
        console.log( "Response sent to: " + rinfo.address + ":" + rinfo.port );
      }
    });
  
  });  
};

// -------------------------------------------

/*
 * Build the configuration file, then start the server
 */
(function() {
  confBuilder.build(configPath, function(newConf) {
    conf = newConf; //store the configration object globally,
    
    server.bind(conf.options.port, conf.options.host);
    
    console.log('Started server on ' + conf.options.host + ':' + conf.options.port );
    console.log('Using ' +  conf.options.dataStoreMethod + ' as the data store');
  });
})();
