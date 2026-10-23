/* Weather and IMDb watchlist picks, cached locally for immediate startup. */
var CONFIG = window.CONFIG || {};

var Place = (function () {
  'use strict';

  /** A time zone's main city: {country, lat, lon, name}, or null. */
  function zone(name) {
    var all = window.ZONES || {}, v = all[name], hops = 0;
    while (v && v.charAt(0) === '=' && hops++ < 3) { name = v.slice(1); v = all[name]; }
    if (!v) return null;
    var p = v.split(',');
    return {country: p[0], lat: p[1], lon: p[2], name: p[3] || name.slice(name.lastIndexOf('/') + 1).replace(/_/g, ' ')};
  }

  var tz = zone(TV.zone()), set = CONFIG.latitude !== '' && CONFIG.latitude !== undefined;
  var country = (CONFIG.tmdbRegion || (tz ? tz.country : '') || 'US').toUpperCase();
  return {
    lat: set ? CONFIG.latitude : tz ? tz.lat : '40.7128',
    lon: set ? CONFIG.longitude : tz ? tz.lon : '-74.0060',
    city: CONFIG.city || (!set && tz ? tz.name : ''),
    country: country,
    /** Fahrenheit for TVs in the US (by their time zone, or their language when it doesn't tell). */
    fahrenheit: tz ? tz.country === 'US' : /-US$/i.test(navigator.language || '')
  };
})();

var Prefs = (function () {
  'use strict';
  var KEY = 'fmtv.prefs';
  var v = {};
  try { v = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  function pick(name, fallback) { return v[name] === undefined ? fallback : v[name]; }
  return {
    version: 0,
    language: function () { return pick('language', CONFIG.language || 'auto'); },
    temperature: function () { return pick('temperature', CONFIG.temperature || 'auto'); },
    theme: function () { return pick('theme', 'auto'); },
    weather: function () { return pick('weather', true); },
    tab: function () { return Math.max(0, Math.min(4, Math.floor(Number(pick('tab', 0)) || 0))); },
    shelf: function () { return pick('shelf', null); },
    set: function (name, value) { v[name] = value; save(); this.version++; }
  };
})();

var Data = (function () {
  'use strict';

  function store(key, value) { try { localStorage.setItem('fmtv.' + key, JSON.stringify(value)); } catch (e) {} }
  function stored(key) { try { return JSON.parse(localStorage.getItem('fmtv.' + key)); } catch (e) { return null; } }

  /** GET a JSON document; done(error, json). */
  function get(url, headers, done) {
    var x = new XMLHttpRequest();
    var over = false;
    x.open('GET', url, true);
    x.timeout = 10000;
    for (var h in headers) if (headers.hasOwnProperty(h)) x.setRequestHeader(h, headers[h]);
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || over) return;
      over = true;
      if (x.status !== 200) { done(new Error(x.status === 401 ? 'TMDB rejected the key' : 'HTTP ' + x.status)); return; }
      var json;
      try { json = JSON.parse(x.responseText); } catch (e) { done(e); return; }
      done(null, json);
    };
    x.ontimeout = x.onerror = function () { if (!over) { over = true; done(new Error('no connection')); } };
    x.send();
  }

  var listeners = [];
  function changed(kind) { for (var i = 0; i < listeners.length; i++) listeners[i](kind || 'settings'); }

  // MARK: - Weather

  var PLACE = Place.lat + ',' + Place.lon;
  var weather = null, weatherAt = 0, fetchingWeather = false;
  (function () {
    var w = stored('weather');
    if (w && w.place === PLACE) { weather = parseWeather(w.body); weatherAt = w.at; }
  })();

  /** "2026-10-20T18:31" at the location (Open-Meteo's local time) → epoch ms. */
  function localTime(iso, offsetSeconds) {
    var m = /^(\d+)-(\d+)-(\d+)T(\d+):(\d+)/.exec(iso || '');
    if (!m) return 0;
    return Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) - offsetSeconds * 1000;
  }

  function parseWeather(o) {
    if (!o || !o.current) return null;
    var off = o.utc_offset_seconds || 0, now = Date.now();
    var w = {
      temp: o.current.temperature_2m, code: o.current.weather_code, isDay: o.current.is_day !== 0,
      max: o.daily.temperature_2m_max[0], min: o.daily.temperature_2m_min[0],
      sunrise: localTime(o.daily.sunrise[0], off), sunset: localTime(o.daily.sunset[0], off), hours: []
    };
    var hr = o.hourly;
    for (var i = 0; hr && i < hr.time.length && w.hours.length < 6; i++) {
      var at = localTime(hr.time[i], off);
      if (at <= now) continue;
      w.hours.push({at: at, temp: hr.temperature_2m[i], code: hr.weather_code[i], day: !hr.is_day || hr.is_day[i] !== 0});
    }
    return w;
  }

  function refreshWeather() {
    var now = Date.now();
    if (fetchingWeather || (now - weatherAt < 30 * 60000 && now >= weatherAt)) return;
    fetchingWeather = true;
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + Place.lat + '&longitude=' + Place.lon
        + '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset'
        + '&hourly=temperature_2m,weather_code,is_day&timezone=auto&forecast_days=2';
    get(url, {}, function (err, body) {
      fetchingWeather = false;
      if (err) return;
      weather = parseWeather(body);
      weatherAt = Date.now();
      store('weather', {place: PLACE, body: body, at: weatherAt});
      changed('weather');
    });
  }

  // MARK: - Watchlist

  var SERVICES = [
    ['youtube', 'youtube', /^youtube\.leanback\.v4$|\.TizenYouTube$/, /^youtube$/i, 'YouTube'],
    ['netflix', 'netflix', /^netflix$/, /netflix/i, 'Netflix'],
    ['mubi', 'mubi', /^com\.mubi$|^mubi$/, /mubi/i, 'MUBI'],
    ['plex', 'plex', /^cdp-30$|plex/, /plex/i, 'Plex']
    // ['max', 'max', /hbo|wbd|\.max/, /^(hbo )?max$|hbo max/i, 'HBO Max'],
    // ['prime video', 'prime', /^amazon$/, /prime video|amazon/i, 'Prime Video'],
    // ['disney', 'disney', /disney/, /disney/i, 'Disney+'],
    // ['hulu', 'hulu', /^hulu/, /hulu/i, 'Hulu'],
    // ['paramount', 'paramount', /paramount|cbs/, /paramount/i, 'Paramount+'],
    // ['peacock', 'peacock', /peacock/, /peacock/i, 'Peacock'],
    // ['globoplay', 'globoplay', /globoplay/, /globoplay/i, 'Globoplay'],
    // ['apple tv', 'appletv', /appletv|apple\.tv/, /apple tv/i, 'Apple TV']
  ];

  var installed = [];   // the TV's apps, from TV.apps()

  /** The installed app for a service key, or null. */
  function appFor(key) {
    for (var s = 0; s < SERVICES.length; s++) {
      if (SERVICES[s][1] !== key) continue;
      for (var i = 0; i < installed.length; i++) {
        if (SERVICES[s][2].test(installed[i].id) || SERVICES[s][3].test(installed[i].title)) return installed[i];
      }
    }
    return null;
  }

  var snapshot = stored('watchlist');
  var seed = window.WATCHLIST_SEED;
  if (!Watchlist.valid(snapshot, CONFIG)) snapshot = null;
  if (Watchlist.valid(seed, CONFIG) && (!snapshot || seed.updatedAt > snapshot.updatedAt)) snapshot = seed;
  seed = null;
  window.WATCHLIST_SEED = null;
  var localWatched = stored('watched');
  if (!localWatched || localWatched.source !== Watchlist.source(CONFIG) || !localWatched.ids) {
    localWatched = {source: Watchlist.source(CONFIG), ids: {}};
  }

  function isWatched(pick) {
    if (localWatched.ids[pick.imdbId || pick.id]) return true;
    var picks = snapshot ? snapshot.picks : [];
    for (var index = 0; index < picks.length; index++) {
      if (picks[index].id === pick.id) return !!picks[index].watched;
    }
    return !!pick.watched;
  }

  function catalogPicks() {
    return (snapshot ? snapshot.picks : []).map(function (pick) {
      if (!localWatched.ids[pick.imdbId || pick.id] || pick.watched) return pick;
      var result = {};
      for (var name in pick) if (pick.hasOwnProperty(name)) result[name] = pick[name];
      result.watched = true;
      return result;
    });
  }

  function markWatched(pick) {
    if (!pick || isWatched(pick)) return;
    localWatched.ids[pick.imdbId || pick.id] = true;
    store('watched', localWatched);
    catalogs = {};
    browseCatalogs = {};
    changed('watchlist');
  }
  var fetchingRecs = false, pollingRecs = false, pollTimer = 0, recsError = '';
  var active = !document.hidden, nextRecsAt = 0, savedRecsAt = snapshot ? snapshot.updatedAt : 0;
  var sessionSeed = '', sessionAt = 0, catalogs = {}, browseCatalogs = {}, previousFeatured = {}, featured = {}, sessionFeatured = {};

  function startSession() {
    if (sessionAt && Date.now() - sessionAt < 1000) return;
    sessionAt = Date.now();
    sessionSeed = sessionAt + ':' + Math.random();
    var previous = stored('featured');
    previousFeatured = previous && previous.source === Watchlist.source(CONFIG) ? previous.tabs || {} : {};
    featured = {};
    for (var key in previousFeatured) if (previousFeatured.hasOwnProperty(key)) featured[key] = previousFeatured[key];
    catalogs = {};
    browseCatalogs = {};
    sessionFeatured = {};
  }

  startSession();

  function withTvCounts(pick) {
    if (pick.kind !== 'tv') return pick;
    var counts = [];
    function count(value, season) {
      if (!(value > 0) || !isFinite(value) || Math.floor(value) !== value) return;
      var singular = value === 1;
      counts.push(season ? tr(value + (singular ? ' temporada' : ' temporadas'),
        value + (singular ? ' season' : ' seasons'), value + (singular ? ' temporada' : ' temporadas'))
        : tr(value + (singular ? ' episódio' : ' episódios'), value + (singular ? ' episode' : ' episodes'),
          value + (singular ? ' episodio' : ' episodios')));
    }
    if (pick.seasons > 1) count(pick.seasons, true);
    else if (pick.seasons === 1) count(pick.episodes, false);
    if (counts.length) {
      var meta = pick.meta || '', suffix = pick.service ? ' · ' + pick.service : '';
      if (suffix && meta.slice(-suffix.length) === suffix) meta = meta.slice(0, -suffix.length);
      pick.meta = [meta, counts.join(' · '), pick.service].filter(Boolean).join(' · ');
    }
    return pick;
  }

  function catalog(kind) {
    var key = kind || 'explore';
    if (catalogs[key]) return catalogs[key];
    var list = Watchlist.select(catalogPicks(), kind, function (service) {
      return (CONFIG.watchlistServices || []).indexOf(service) >= 0 && !!appFor(service);
    }, sessionSeed, null).map(withTvCounts);
    var previous = previousFeatured[key] || [], chosen = [], selected = {};
    var retained = sessionFeatured[key] || [];
    for (var retainedIndex = 0; retainedIndex < retained.length; retainedIndex++) {
      for (var listIndex = 0; listIndex < list.length; listIndex++) {
        if (list[listIndex].id === retained[retainedIndex]) {
          chosen.push(list[listIndex]);
          selected[list[listIndex].id] = true;
          break;
        }
      }
    }
    for (var index = 0; index < list.length && chosen.length < 3; index++) {
      if (!selected[list[index].id] && previous.indexOf(list[index].id) < 0) {
        chosen.push(list[index]); selected[list[index].id] = true;
      }
    }
    for (var remaining = 0; remaining < list.length && chosen.length < 3; remaining++) {
      if (!selected[list[remaining].id]) { chosen.push(list[remaining]); selected[list[remaining].id] = true; }
    }
    catalogs[key] = chosen.concat(list.filter(function (pick) { return !selected[pick.id]; }));
    if (chosen.length) {
      featured[key] = chosen.map(function (pick) { return pick.id; });
      sessionFeatured[key] = featured[key];
      store('featured', {source: Watchlist.source(CONFIG), tabs: featured});
    }
    return catalogs[key];
  }

  function now(kind) {
    return catalog(kind).slice(0, 3);
  }

  function browse(kind) {
    var key = kind || 'explore';
    if (!browseCatalogs[key]) {
      browseCatalogs[key] = Watchlist.browse(catalogPicks(), kind, function (service) {
        return (CONFIG.watchlistServices || []).indexOf(service) >= 0 && !!appFor(service);
      }, sessionSeed).map(withTvCounts);
    }
    return browseCatalogs[key];
  }

  function refreshRecs(force) {
    if (!active || fetchingRecs || !CONFIG.imdbUserId || (!TV.isWebOS && !TV.isPreview)) return;
    if (!force && Date.now() < nextRecsAt) return;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = 0; }
    fetchingRecs = true;
    TV.watchlist(function (result) {
      var wasPolling = pollingRecs, previousError = recsError, updated = false;
      fetchingRecs = false;
      if (!result) {
        pollingRecs = false;
        nextRecsAt = Date.now() + 10 * 60000;
        recsError = TV.isPreview ? 'Preview server is unavailable. Restart node tools/preview.js.'
            : 'Watchlist service is unavailable. Reinstall the updated webOS package.';
        changed('status');
        return;
      }
      if (Watchlist.valid(result.snapshot, CONFIG) && (!snapshot || snapshot.updatedAt !== result.snapshot.updatedAt)) {
        snapshot = result.snapshot;
        catalogs = {};
        browseCatalogs = {};
        updated = true;
      }
      recsError = result.error || snapshot && (snapshot.warnings || []).join(' ') || '';
      pollingRecs = !!result.refreshing;
      if (snapshot && !pollingRecs && savedRecsAt !== snapshot.updatedAt) {
        store('watchlist', snapshot);
        savedRecsAt = snapshot.updatedAt;
      }
      nextRecsAt = Date.now() + (pollingRecs ? 15000 : 5 * 60000);
      if (updated || force || wasPolling !== pollingRecs || previousError !== recsError) changed(updated ? 'watchlist' : 'status');
      if (pollingRecs && active) pollTimer = setTimeout(function () { refreshRecs(false); }, 15000);
    }, force, snapshot);
  }

  function all() {
    return browse(null);
  }

  var detailCache = {}, detailPending = {};
  function details(pick, done) {
    if (pick.detailsLoaded && typeof pick.trailer === 'string' && pick.credits) { done(null, pick); return; }
    if (detailCache[pick.id]) { done(null, detailCache[pick.id]); return; }
    if (detailPending[pick.id]) { detailPending[pick.id].push(done); return; }
    var key = (CONFIG.tmdbKey || '').trim();
    if (!key) { done(null, pick); return; }
    detailPending[pick.id] = [done];
    function finish(error, result) {
      if (!error) detailCache[pick.id] = result;
      var waiting = detailPending[pick.id];
      delete detailPending[pick.id];
      waiting.forEach(function (callback) { callback(error, result || pick); });
    }
    function tmdb(path, callback) {
      var bearer = key.indexOf('eyJ') === 0;
      get('https://api.themoviedb.org/3' + path + (path.indexOf('?') < 0 ? '?' : '&')
        + 'language=' + encodeURIComponent(I18N.locale()) + (bearer ? '' : '&api_key=' + encodeURIComponent(key)),
        bearer ? {Authorization: 'Bearer ' + key} : {}, callback);
    }
    function load(id) {
      tmdb('/' + pick.kind + '/' + id + '?append_to_response=videos,credits&include_video_language=en,'
        + I18N.lang, function (error, detail) {
        if (error) { finish(error); return; }
        if (!detail || Number(detail.id) !== Number(id)) { finish(new Error('Title details are unavailable.')); return; }
        var result = {};
        for (var name in pick) if (pick.hasOwnProperty(name)) result[name] = pick[name];
        result.poster = detail.poster_path ? 'https://image.tmdb.org/t/p/w500' + detail.poster_path : pick.poster || '';
        result.overview = detail.overview || '';
        result.genres = (detail.genres || []).map(function (genre) { return genre.name; });
        result.rating = detail.vote_count > 0 ? Number(detail.vote_average) || 0 : 0;
        result.trailer = Watchlist.trailer(detail.videos, I18N.lang);
        result.credits = Watchlist.credits(detail, pick.kind);
        result.detailsLoaded = true;
        finish(null, result);
      });
    }
    if (pick.tmdbId) { load(pick.tmdbId); return; }
    tmdb('/find/' + pick.imdbId + '?external_source=imdb_id', function (error, found) {
      if (error) { finish(error); return; }
      var matches = found && found[pick.kind === 'tv' ? 'tv_results' : 'movie_results'] || [];
      if (!matches.length) { finish(null, pick); return; }
      load(matches[0].id);
    });
  }

  // MARK: - Formatting

  return {
    city: Place.city,
    onChange: function (fn) { listeners.push(fn); },
    setApps: function (apps) { installed = apps; catalogs = {}; browseCatalogs = {}; },
    startSession: startSession,
    refreshWatchlist: function () { refreshRecs(true); changed('status'); },
    setActive: function (value) {
      active = value;
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = 0; }
      if (active) nextRecsAt = 0;
    },
    appFor: appFor,
    refresh: function () { if (active) { refreshWeather(); refreshRecs(); } },
    settingsChanged: changed,
    get weather() { return weather; },
    get weatherAt() { return weatherAt; },
    watchlistStatus: function () {
      return {configured: !!CONFIG.imdbUserId, refreshing: fetchingRecs || pollingRecs,
        total: snapshot ? snapshot.entries.length : 0,
        available: snapshot ? snapshot.picks.filter(function (pick) { return pick.options.length > 0; }).length : 0,
        loaded: !!snapshot, error: recsError || snapshot && (snapshot.warnings || []).join(' ') || ''};
    },
    recsError: function () { return recsError; },
    picks: now,
    details: details,
    isWatched: isWatched,
    markWatched: markWatched,
    catalog: catalog,
    browse: browse,
    showcase: all,
    image: function (path, size) {
      if (!path) return '';
      var prefix = 'https://image.tmdb.org/t/p/';
      size = size || 'w1280';
      if (/^https?:\/\/image\.tmdb\.org\/t\/p\/[^/]+\//.test(path)) {
        return path.replace(/^https?:\/\/image\.tmdb\.org\/t\/p\/[^/]+\//, prefix + size + '/');
      }
      return /^https?:/.test(path) ? path : prefix + size + path;
    },

    /** Night at the location: from sunset to sunrise (the last forecast; without one, 6:00 and 18:00). */
    isNight: function (at) {
      var theme = Prefs.theme();
      if (theme === 'dark') return true;
      if (theme === 'light') return false;
      var d = new Date(at), mins = d.getHours() * 60 + d.getMinutes();
      function hm(t, fallback) { if (!t) return fallback; var x = new Date(t); return x.getHours() * 60 + x.getMinutes(); }
      var rise = hm(weather && weather.sunrise, 360), set = hm(weather && weather.sunset, 1080);
      return mins < rise || mins >= set;
    },

    degrees: function (v) {
      if (v === undefined || v === null || isNaN(v)) return '—';
      var unit = Prefs.temperature();
      var f = unit === 'F' || (unit === 'auto' && Place.fahrenheit);
      return Math.round(f ? v * 9 / 5 + 32 : v) + '°';
    },
    hour: function (at) {
      var d = new Date(at), h = d.getHours();
      if (I18N.lang === 'en') return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM');
      if (I18N.lang === 'de') return (h < 10 ? '0' : '') + h + ' Uhr';
      return (I18N.lang === 'es' || I18N.lang === 'ru') ? (h < 10 ? '0' : '') + h + ':00' : h + 'h';
    },
    time: function (at) {
      var d = new Date(at), h = d.getHours(), m = d.getMinutes();
      if (I18N.lang === 'en') return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    },
    /** "12 min ago" when the data is old (no internet), or empty. */
    staleness: function (at, every) {
      if (!at) return '';
      var age = Date.now() - at;
      if (age < every * 2) return '';
      var m = Math.floor(age / 60000), h = Math.floor(m / 60);
      return m < 60 ? tr('há ' + m + ' min', m + ' min ago', 'hace ' + m + ' min') : tr('há ' + h + ' h', h + ' h ago', 'hace ' + h + ' h');
    },
    condition: function (code, day) {
      if (code === undefined || code === null || code < 0) return '';
      if (code === 0) return tr(day ? 'Céu limpo' : 'Noite limpa', 'Clear', day ? 'Despejado' : 'Noche despejada');
      if (code === 1) return tr('Poucas nuvens', day ? 'Mostly Sunny' : 'Mostly Clear', 'Mayormente despejado');
      if (code === 2) return tr('Parcialmente nublado', 'Partly Cloudy', 'Parcialmente nublado');
      if (code === 3) return tr('Nublado', 'Cloudy', 'Nublado');
      if (code === 45 || code === 48) return tr('Neblina', 'Fog', 'Niebla');
      if (code >= 51 && code <= 57) return tr('Garoa', 'Drizzle', 'Llovizna');
      if (code === 65 || code === 67 || code === 82) return tr('Chuva forte', 'Heavy Rain', 'Lluvia fuerte');
      if ((code >= 71 && code <= 77) || code === 85 || code === 86) return tr('Neve', 'Snow', 'Nieve');
      if (code >= 95) return tr('Tempestade', 'Thunderstorms', 'Tormenta');
      return tr('Chuva', 'Rain', 'Lluvia');
    },
    symbol: function (code, day) {
      if (code <= 1) return day ? 'sunny' : 'clear_night';
      if (code === 2) return day ? 'partly_cloudy_day' : 'partly_cloudy_night';
      if (code === 3) return 'cloud';
      if (code === 45 || code === 48) return 'foggy';
      if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snowflake';
      if (code >= 95) return 'thunderstorm';
      return 'rainy';
    }
  };
})();
