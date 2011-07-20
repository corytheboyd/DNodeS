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

var bind = require('./bindparse.js'),
    dnsSupport = require('./dnssupport.js');

exports.fetchRecord = function(conf, domain, type, callback) {
  var records = []; //the records to return
  type = dnsSupport.getValidType(type);
  
  bind.parse(conf.bind.confPath, function(bindConfig) {
    Object.keys(bindConfig.zones).forEach(function(zoneDomain) {
      var zone = bindConfig.zones[zoneDomain];
      
      zone.records.forEach(function(record) {
        if ( record.type.toLowerCase() == type && dnsSupport.compareDomains(domain, zoneDomain, record.owner) ) {
          if (type == 'a') {
            records.push({
              address: record.rr
            });
          } else if (type == 'ns') {
            records.push({
              server: record.rr
            });
          } else if (type == 'cname') {
            records.push({
              cname: record.rr
            });
          } else if (type == 'txt') {
            records.push({
              text: record.rr
            });
          } else if (type == 'mx') {
            var data = record.rr.split(/\s+/);
            
            records.push({
              preference: parseInt(data[0]),
              exchange: new Buffer(data[1])
            });
            
            console.log(records);
          }
        }
      });
    });
    callback(records);
  });
};

