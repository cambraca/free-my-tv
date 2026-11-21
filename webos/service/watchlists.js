'use strict';

var fs = require('fs');

// Each IMDb account owns its crawl and cache. All accounts match against the same Plex library.
module.exports = function (Watchlist, config, request, pathFor, seeds, legacy) {
  var profiles = config.imdbAccounts || (config.imdbUserId ? [{id: config.imdbUserId}] : []);
  var states = {}, library = null, plexWaiters = null, disposed = false;

  profiles.forEach(function (profile) {
    var settings = {};
    Object.keys(config).forEach(function (key) { settings[key] = config[key]; });
    settings.imdbUserId = profile.id;
    var path = pathFor(profile.id), cached;
    try { cached = JSON.parse(fs.readFileSync(path, 'utf8')); } catch (error) {}
    var state = states[profile.id] = {config: settings, path: path, snapshot: null, running: false, at: 0, error: ''};
    [cached, legacy, seeds && (seeds[profile.id] || seeds)].forEach(function (candidate) {
      if (Watchlist.valid(candidate, settings) && (!state.snapshot || candidate.updatedAt > state.snapshot.updatedAt)) {
        state.snapshot = candidate;
      }
    });
    if (Watchlist.plexLinksReady(state.snapshot) && Watchlist.watchedReady(state.snapshot)
        && (!library || state.snapshot.plex.at > library.at)) library = state.snapshot.plex;
  });

  var all = profiles.map(function (profile) { return states[profile.id]; });
  function updateLibrary() {
    if (!library) return;
    all.forEach(function (state) {
      if (!state.running) state.snapshot = Watchlist.withLibrary(state.config, state.snapshot, library);
    });
  }
  updateLibrary();

  function getLibrary(force, started, done) {
    if (library && (force ? library.at >= started : Watchlist.fresh(library.at))) { done(null, library); return; }
    if (plexWaiters) { plexWaiters.push(done); return; }
    plexWaiters = [done];
    Watchlist.scanPlex(config, request, function (err, result) {
      if (result) { library = result; updateLibrary(); }
      var waiting = plexWaiters;
      plexWaiters = null;
      waiting.forEach(function (callback) { callback(err, library); });
    });
  }

  function refresh(state, force, activity, started) {
    if (!state || state.running || (!force && Date.now() - state.at < 600000)) return;
    var previous = state.snapshot;
    if (!force && previous && Watchlist.fresh(previous.updatedAt) && Watchlist.fresh(previous.entriesAt)
        && Watchlist.fresh(previous.plex && previous.plex.at)
        && Watchlist.notesReady(previous) && Watchlist.plexLinksReady(previous) && Watchlist.watchedReady(previous)
        && Watchlist.availabilityReady(previous) && !previous.warnings.length) return;
    state.running = true;
    state.at = started || Date.now();
    activity(function (finished) {
      Watchlist.sync(state.config, previous, request, previous ? null : function (partial) {
        state.snapshot = partial;
      }, function (err, result) {
        state.running = false;
        state.error = err ? err.message : '';
        if (result && !disposed) {
          state.snapshot = library ? Watchlist.withLibrary(state.config, result, library) : result;
          try {
            fs.writeFileSync(state.path + '.tmp', JSON.stringify(state.snapshot));
            fs.renameSync(state.path + '.tmp', state.path);
          } catch (error) { state.error = 'Could not save the watchlist cache.'; }
        }
        finished(state);
      }, force, function (callback) { getLibrary(force, state.at, callback); });
    });
  }

  function get(id) {
    return id ? (Object.prototype.hasOwnProperty.call(states, id) ? states[id] : null) : all[0];
  }

  function forTitle(id) {
    var latest;
    all.forEach(function (state) {
      if (state.snapshot && (!latest || state.snapshot.updatedAt > latest.snapshot.updatedAt)
          && state.snapshot.picks.some(function (pick) { return pick.imdbId === id; })) latest = state;
    });
    return latest;
  }

  return {
    get: get, forTitle: forTitle, refresh: refresh, all: all,
    refreshAll: function (activity) {
      var started = Date.now();
      all.forEach(function (state) { refresh(state, true, activity, started); });
    },
    torrentSnapshot: function (id) {
      if (id) { var state = forTitle(id); return state && state.snapshot; }
      return {updatedAt: all.reduce(function (at, state) {
        return Math.max(at, state.snapshot ? state.snapshot.updatedAt : 0);
      }, 0)};
    },
    complete: function () { return all.length > 0 && all.every(function (state) { return state.snapshot && !state.running; }); },
    dispose: function () { disposed = true; }
  };
};
