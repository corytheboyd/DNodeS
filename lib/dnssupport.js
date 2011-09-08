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

var assert = require('assert'),
    responseHandler = require('./responsehandler.js');

/*
  Reads a raw input buffer for a dns query an returns
  a JS object.
*/
exports.processRequest = function(req) {
  //reference RFC1035
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

  query.header.qr = sliceBits(tmpByte, 0,1);
  query.header.opcode = sliceBits(tmpByte, 1,4);
  query.header.aa = sliceBits(tmpByte, 5,1);
  query.header.tc = sliceBits(tmpByte, 6,1);
  query.header.rd = sliceBits(tmpByte, 7,1);

  tmpSlice = req.slice(3,4);
  tmpByte = tmpSlice.toString('binary', 0, 1).charCodeAt(0);

  query.header.ra = sliceBits(tmpByte, 0,1);
  query.header.z = sliceBits(tmpByte, 1,3);
  query.header.rcode = sliceBits(tmpByte, 4,4);
  query.header.qdcount = req.slice(4,6);
  query.header.ancount = req.slice(6,8);
  query.header.nscount = req.slice(8,10);
  query.header.arcount = req.slice(10, 12);

  query.question.qname = req.slice(12, req.length - 4);
  query.question.qtype = req.slice(req.length - 4, req.length - 2);
  query.question.qclass = req.slice(req.length - 2, req.length);

	/* 
		VALIDATE TYPE, SET ERRORS IF NEED BE
		Error codes (rcode):
		0: no error
		3: name issue
		4: type not implemented 
	*/
	
	if ( !getValidType(query.question.qtype) ) {
		query.header.rcode = 3;
	}

  return query;
};

/*
  Send a response based on the query provided through
  the server socket.
*/
exports.sendResponse = function(conf, query, server, rinfo) {
  var domain = bufferToDomain( query.question.qname );
  var type = bufferToNumber( query.question.qtype );
  
  //fetch record from the mysql data store
  conf.fetchRecords(conf, domain, type, function(records) {	
    var respObject = responseHandler.create(conf, query, type, records);

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

/*
  Compares two domains for equality, taking into account
  BIND special characters.
  
  @param query    the domain in question
  @param domain   the base domain for the zone
  @param owner    the owner of the entry, either a subdomain or special char
*/
var compareDomains = exports.compareDomains = function(query, domain, owner) {
  if (domain == '.' || domain == '') {
    if (owner == '*.' || owner == '*') {
      return true;
    } else if (owner == '@' && (query == '.' || query == '') ) {
      return true;
    } else return false;
  } else if (owner == '@') {
    return query == domain; 
  } else if (owner == '*') {
    return (query != domain) && (domain == query.split('.').slice(query.split('.').length - domain.split('.').length).join('.'));
  } else if (owner == '*.') {
    return domain == query.split('.').slice(query.split('.').length - domain.split('.').length).join('.');
  } else {
    return query == owner;
  }
};

/*
 * Creates a buffer of size len with all octets initialized to zero
 */
var getZeroBuf = exports.getZeroBuf = function(len) {
    buf = new Buffer(len);
    for(var i=0;i<buf.length;i++) { buf[i]=0;}
    return buf;
};

/*
 * Check a type (either numeric or string) and return the string if
 * supported, null if not.
 */
var getValidType = exports.getValidType = function(type) {
	if ( Buffer.isBuffer(type) ) type = bufferToNumber(type);
		
	const INT_TYPES = { 1:'a', 5:'cname', 16:'txt', 15:'mx' };
	const VALID_TYPES = ['a', 'cname', 'txt', 'mx'];
	
	if ( typeof(type) == 'number' ) {
		if ( type in Object.keys(INT_TYPES) ) return INT_TYPES[type];
	} else if ( typeof(type) == 'string' ) {
		if ( type.toLowerCase() in VALID_TYPES ) return type.toLowerCase();
	}
	
	return null;
};

/*
 * Convert address string to Buffer object per RFC specs
 */
var addressToBuffer = exports.addressToBuffer = function(address) {
  var buf = getZeroBuf(4);
  var tokens = address.split('.');
  
  for ( var i = 0; i < 4; i++ ) {
    buf[i] = parseInt(tokens[i]);
  }
  
  return buf
}

/*
 * Convert a demial number to hex
 */
var decimalToHex = exports.decimalToHex = function(d, padding) {
  var hex = Number(d).toString(16);
  padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

  while (hex.length < padding) {
      hex = "0" + hex;
  }

  return hex;
};

/*
 * Convert a buffer to a JS Number
 */
var bufferToNumber = exports.bufferToNumber = function( buf ) {
  var hexStr = '';
  
  for ( var i = 0; i < buf.length; i++ ) {
    hexStr += decimalToHex( buf[i] );
  }

  return parseInt(hexStr, 16);
};

/*
 * Convert a JS number to a Buffer. Returns the created buffer;
 */
var numToBuffer = exports.numToBuffer = function(buf, offset, num, len) {
  if (typeof num != 'number') {
    throw new Error('Num must be a number');
  }
  
  if (typeof len == 'undefined') {
    len = buf.length;
  }

  for ( var i = offset; i < offset + len; i++ ) {
    var shift = 8*((len - 1) - (i - offset));
    var insert = (num >> shift) & 255;
    buf[i] = insert;
  }
  
  return buf;
};

/*
 * Convert a domain string to a hexLabel (per RFC specs)
 * TODO make it work with trailing dot (fqdn)
 */
var domainToBuffer = exports.domainToBuffer = function(domain) {
  var len = domain.length + 2;
  if (domain.match(/\.$/)) len -= 1;
  var domainBuffer = getZeroBuf( len ); //buffer is the size of the string, plus an extra 1 for first length octet and the zero terminator octet
  var offset = 0; //offset for adding labels to buffer
  
  domain.split(".").forEach(function(label) {
    if(label) stringToBuffer(label).copy(domainBuffer, offset); //copy the label buffer to the domain buffer
    offset += label.length + 1; //increment offset
  });

  domainBuffer[domainBuffer.length - 1] = 0; //add the null terminator
  return domainBuffer;
};

/*
 * Convert a string of length <= 255 characters to a character string per RFC specs
 */
var stringToBuffer = exports.stringToBuffer = function(string) {
  assert.ok(string.length < 255, 'String length must be less than 256 characters');
  var divs = Math.floor( 1 + (string.length / 255) );
  
  var buf = getZeroBuf( divs + string.length );
  var offset = 0;
  
  for ( var i = 0; i < divs; i++ ) {
    var size = ( i + 1 != divs ) ? 255 : string.length;
    var s = string.slice(0, size);
    string = string.slice(size, string.length);
    
    var tbuf = getZeroBuf(size + 1);
    tbuf[0] = size;
    
    for ( var j = 0; j < s.length; j++ ) {
      tbuf[j + 1] = s.charCodeAt(j);
    }
    
    tbuf.copy( buf, offset, 0 );
    offset += size + 1;
  }
  return buf;
};

/*
 * Convert a hexLabel (per RFC specs) to a readable domain string
 */
var bufferToDomain = exports.bufferToDomain = function(hexLabel) {
  var domain= '';
  for ( var i = 0; i < hexLabel.length; i++ ) {
    if ( hexLabel[i] == 0 ) {
        //last char chop trailing .
        domain = domain.substring(0, domain.length - 1);
        break;
    }
    
    var tmpBuf = hexLabel.slice(i + 1, i + hexLabel[i] + 1);
    domain += tmpBuf.toString('binary', 0, tmpBuf.length);
    domain += '.';
    
    i = i + hexLabel[i];
  }
  
  return domain;
};

/*
 * Slice a byte into bits using black magic
 */
var sliceBits = exports.sliceBits = function(b, off, len) {
  var s = 7 - (off + len - 1);

  b = b >>> s;
  return b & ~(0xff << len);
};
