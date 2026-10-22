'use strict';

var fs = require('fs');
var Watchlist = require('../web/watchlist');
var request = require('./watchlist-network');
var config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
var target = process.argv[3], previous = null;
try { previous = JSON.parse(fs.readFileSync(target, 'utf8')); } catch (err) {}
if (Watchlist.valid(previous, config) && Watchlist.fresh(previous.updatedAt) && !previous.warnings.length) {
  console.log('Using cached watchlist: ' + previous.entries.length + ' titles, ' + previous.picks.length + ' available.');
  process.exit(0);
}
Watchlist.sync(config, previous, request, null, function (err, snapshot) {
  if (err) { console.error(err.message); process.exitCode = 1; return; }
  var temporary = target + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(snapshot));
  fs.renameSync(temporary, target);
  console.log('Watchlist: ' + snapshot.entries.length + ' titles, ' + snapshot.picks.length + ' available on your services.');
  snapshot.warnings.forEach(function (warning) { console.error(warning); });
});
