'use strict';

var http = require('http');
var https = require('https');
var url = require('url');
var zlib = require('zlib');

module.exports = function request(method, target, headers, body, done, redirects) {
  var options = url.parse(target), complete = false;
  options.method = method;
  options.headers = headers || {};
  options.headers['User-Agent'] = 'FreeMyTV/1.0';
  options.headers['Accept-Encoding'] = 'gzip';
  if (body) options.headers['Content-Length'] = Buffer.byteLength(body);
  function finish(err, result) {
    if (complete) return;
    complete = true;
    clearTimeout(timer);
    done(err, result);
  }
  var outgoing = (options.protocol === 'https:' ? https : http).request(options, function (response) {
    if ([301, 302, 303, 307, 308].indexOf(response.statusCode) >= 0 && response.headers.location) {
      response.resume();
      if ((redirects || 0) >= 4) { finish(new Error('Too many redirects')); return; }
      var destination = url.resolve(target, response.headers.location), forwarded = {};
      for (var name in options.headers) {
        if (options.headers.hasOwnProperty(name) && !/authorization|token|cookie/i.test(name)) forwarded[name] = options.headers[name];
      }
      clearTimeout(timer);
      complete = true;
      request(method, destination, forwarded, body, done, (redirects || 0) + 1);
      return;
    }
    if (response.statusCode !== 200) {
      response.resume();
      finish(new Error('HTTP ' + response.statusCode + (response.statusCode === 401 ? ' (check the API token)' : '')));
      return;
    }
    var chunks = [], size = 0;
    response.on('data', function (chunk) {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) { outgoing.abort(); finish(new Error('Response too large')); return; }
      chunks.push(chunk);
    });
    response.on('error', finish);
    response.on('end', function () {
      function parse(err, buffer) {
        if (err) { finish(err); return; }
        var text = buffer.toString('utf8');
        if (/text\/html/i.test(response.headers['content-type'] || '')) { finish(null, text); return; }
        var result;
        try { result = JSON.parse(text); } catch (parseError) { finish(new Error('Invalid JSON response')); return; }
        finish(null, result);
      }
      var buffer = Buffer.concat(chunks);
      if (response.headers['content-encoding'] === 'gzip') zlib.gunzip(buffer, parse);
      else parse(null, buffer);
    });
  });
  var timer = setTimeout(function () { outgoing.abort(); finish(new Error('Request timed out')); }, 20000);
  outgoing.on('error', function () { finish(new Error('Connection failed to ' + options.hostname)); });
  if (body) outgoing.write(body);
  outgoing.end();
};
