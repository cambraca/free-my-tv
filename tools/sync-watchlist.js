'use strict';

var fs = require('fs');
var Watchlist = require('../web/watchlist');
var request = require('./watchlist-network');
var config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
var paths = JSON.parse(process.argv[3]);
var lists = require('../webos/service/watchlists')(Watchlist, config, request, function (id) { return paths[id]; });
lists.all.forEach(function (state) {
  lists.refresh(state, false, function (start) {
    start(function (result) {
      if (result.error) { console.error(result.error); process.exitCode = 1; }
      if (!result.snapshot) return;
      console.log('Watchlist: ' + result.snapshot.entries.length + ' titles, '
        + result.snapshot.picks.filter(function (pick) { return pick.options.length; }).length + ' available.');
      result.snapshot.warnings.forEach(function (warning) { console.error(warning); });
    });
  });
});
