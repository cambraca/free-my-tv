'use strict';

var Service = require('webos-service');
var fs = require('fs');
var Watchlist = require('./watchlist');
var request = require('./watchlist-network');
var config = require('./config.json');
var service = new Service('io.freemytv.watchlist');
var target = '/media/internal/io.freemytv.watchlist.json';
var snapshot = null, loading = true, running = false, lastError = '', attemptedAt = 0;
var waiting = [];

fs.readFile(target, 'utf8', function (err, text) {
  if (!err) {
    try { snapshot = JSON.parse(text); } catch (parseError) {}
  }
  if (!Watchlist.valid(snapshot, config)) {
    try { snapshot = require('./watchlist-seed.json'); } catch (seedError) { snapshot = null; }
  }
  if (!Watchlist.valid(snapshot, config)) snapshot = null;
  loading = false;
  waiting.splice(0).forEach(function (callback) { callback(); });
});

function refresh(force) {
  if (running || (!force && Date.now() - attemptedAt < 10 * 60000)) return;
  if (!force && snapshot && !snapshot.warnings.length && Watchlist.fresh(snapshot.updatedAt) && Watchlist.notesReady(snapshot)
      && Watchlist.plexLinksReady(snapshot)) return;
  running = true;
  attemptedAt = Date.now();
  service.activityManager.create('watchlist-refresh', function (activity) {
    Watchlist.sync(config, snapshot, request, snapshot ? null : function (partial) { snapshot = partial; }, function (err, result) {
      lastError = err ? err.message : '';
      function finished() { running = false; service.activityManager.complete(activity); }
      if (err) { finished(); return; }
      snapshot = result;
      fs.writeFile(target + '.tmp', JSON.stringify(result), function (writeError) {
        if (writeError) { lastError = 'Could not save the watchlist cache.'; finished(); return; }
        fs.rename(target + '.tmp', target, function (renameError) {
          if (renameError) lastError = 'Could not save the watchlist cache.';
          finished();
        });
      });
    }, force);
  });
}

service.register('get', function (message) {
  function respond() {
    if (message.payload.refresh !== false) refresh(message.payload.force === true);
    var client = Watchlist.clientSnapshot(snapshot, message.payload.source, message.payload.updatedAt);
    message.respond({returnValue: true, snapshot: client, refreshing: running, error: lastError});
  }
  if (loading) waiting.push(respond);
  else respond();
});

service.register('plexTarget', function (message) {
  function respond() {
    Watchlist.plexTarget(config, snapshot, message.payload.imdbId, request, function (err, url) {
      message.respond({returnValue: !err, url: url || ''});
    });
  }
  if (loading) waiting.push(respond);
  else respond();
});
