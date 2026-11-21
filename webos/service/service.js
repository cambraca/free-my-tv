'use strict';

var Service = require('webos-service');
var fs = require('fs');
var Watchlist = require('./watchlist');
var request = require('./watchlist-network');
var titleLaunch = require('./title-launch');
var config = require('./config.json');
var service = new Service('io.freemytv.watchlist');
var target = '/media/internal/io.freemytv.watchlist';
var legacy;
try { legacy = JSON.parse(fs.readFileSync(target + '.json', 'utf8')); } catch (error) {}
var lists = require('./watchlists')(Watchlist, config, request, function (id) {
  return target + '-' + id + '.json';
}, require('./watchlist-seed.json'), legacy);

function refreshActivity(start) {
  service.activityManager.create('watchlist-refresh', function (activity) {
    start(function () { service.activityManager.complete(activity); });
  });
}

service.register('get', function (message) {
  var payload = message.payload, state = lists.get(payload.account);
  if (!state) { message.respond({returnValue: true, snapshot: null, refreshing: false}); return; }
  if (payload.refresh !== false) lists.refresh(state, payload.force === true, refreshActivity);
  var client = Watchlist.clientSnapshot(state.snapshot, payload.source, payload.updatedAt);
  message.respond({returnValue: true, snapshot: client, refreshing: state.running, error: state.error});
});

service.register('plexTarget', function (message) {
  var state = lists.forTitle(message.payload.imdbId);
  Watchlist.plexTarget(state ? state.config : config, state && state.snapshot, message.payload.imdbId, request, function (err, url) {
    message.respond({returnValue: !err, url: url || ''});
  });
});

service.register('mubiTarget', function (message) {
  service.activityManager.create('mubi-title', function (activity) {
    titleLaunch.mubiTarget(message.payload.url, request, function (err, id) {
      message.respond({returnValue: !err, contentTarget: id || ''});
      service.activityManager.complete(activity);
    });
  });
});

var openingPlex = false;
service.register('openPlex', function (message) {
  if (openingPlex) { message.respond({returnValue: false}); return; }
  openingPlex = true;
  service.activityManager.create('plex-title', function (activity) {
    var state = lists.forTitle(message.payload.imdbId);
    titleLaunch.openPlex(state ? state.config : config, state && state.snapshot, message.payload.imdbId, request, function (err) {
      openingPlex = false;
      if (err) console.warn('Plex title navigation: ' + err.message);
      message.respond({returnValue: !err});
      service.activityManager.complete(activity);
    });
  });
});

require('./remote-apps')(service);

var torrents = require('./qbittorrent')(config, '/media/internal/io.freemytv.torrents.json',
  lists.torrentSnapshot, function () {
    require('./plex-scan')(config, request, function () { lists.refreshAll(refreshActivity); });
  }, lists.complete);
service.register('torrents', function (message) {
  service.activityManager.create('torrent-request', function (activity) {
    torrents(message.payload, function (err, result) {
      message.respond(err ? {returnValue: true, error: err.message} : result);
      service.activityManager.complete(activity);
    });
  });
});
setInterval(function () {
  if (!config.qbitUrl) return;
  service.activityManager.create('torrent-poll', function (activity) {
    torrents({action: 'status'}, function () { service.activityManager.complete(activity); });
  });
}, 60000);
