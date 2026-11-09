'use strict';
// Completion can precede Plex indexing. Retry scans while completed links remain unavailable.
var last = 0;
module.exports = function (config, request, done) {
  if (!config.plexHost || Date.now() - last < 120000) return;
  last = Date.now();
  var base = 'http://' + config.plexHost + ':' + config.plexPort;
  var headers = {Accept: 'application/json', 'X-Plex-Token': config.plexToken || ''};
  request('GET', base + '/library/sections', headers, null, function (err, data) {
    if (err || !data || !data.MediaContainer) return;
    var sections = (data.MediaContainer.Directory || []).filter(function (s) { return s.type === 'movie' || s.type === 'show'; });
    var pending = sections.length;
    sections.forEach(function (s) {
      request('GET', base + '/library/sections/' + encodeURIComponent(s.key) + '/refresh',
        {Accept: 'application/xml', 'X-Plex-Token': config.plexToken || ''}, null, function () {
          if (--pending === 0) setTimeout(done, 15000);
        });
    });
  });
};
