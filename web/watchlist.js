(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Watchlist = factory();
})(this, function () {
  'use strict';

  var SCHEMA = 2;
  var TTL = 6 * 3600000;
  var PROVIDERS = {netflix: 'Netflix', mubi: 'MUBI'};
  var PROFILE_QUERY = 'query Profile($profileId: ID!) { userProfile(input: {profileId: $profileId}) { userId } }';
  var LIST_QUERY = 'query Watchlist($userId: ID!, $first: Int!, $after: ID) {'
      + ' predefinedList(classType: WATCH_LIST, userId: $userId) {'
      + ' items(first: $first, after: $after, sort: {by: LIST_ORDER, order: DESC}) {'
      + ' pageInfo {hasNextPage endCursor} edges {node {createdDate description {originalText {plainText}} listItem {'
      + ' ... on Title {id titleText {text} titleType {id} releaseYear {year} primaryImage {url}}}}} } } }';

  function fingerprint(value) {
    var hash = 2166136261;
    for (var index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16);
  }

  function source(config) {
    return SCHEMA + ':' + (config.imdbUserId || '') + ':' + fingerprint(JSON.stringify([
      config.tmdbKey || '', config.tmdbRegion || 'US', config.language || 'en', config.watchlistServices || [],
      config.plexHost || '', config.plexPort || 32400, config.plexToken || ''
    ]));
  }

  function valid(snapshot, config) {
    return !!(snapshot && snapshot.schema === SCHEMA && snapshot.source === source(config)
        && Array.isArray(snapshot.entries) && Array.isArray(snapshot.picks));
  }

  function fresh(at) { return at > 0 && Date.now() >= at && Date.now() - at < TTL; }

  function clientSnapshot(snapshot, knownSource, knownAt) {
    if (!snapshot || (snapshot.source === knownSource && snapshot.updatedAt === Number(knownAt))) return null;
    return {schema: snapshot.schema, source: snapshot.source, updatedAt: snapshot.updatedAt,
      entries: snapshot.entries.map(function (entry) { return entry.imdbId; }), picks: snapshot.picks,
      warnings: snapshot.warnings};
  }

  function notesReady(snapshot) {
    return !!(snapshot && Array.isArray(snapshot.entries) && snapshot.entries.every(function (entry) {
      return typeof entry.note === 'string';
    }));
  }

  function plexLinksReady(snapshot) {
    var library = snapshot && snapshot.plex;
    return !!(library && (library.linksVersion === 1 || !Object.keys(library.items || {}).length));
  }

  function availabilityReady(snapshot) { return !!(snapshot && snapshot.catalogVersion === 1); }

  function duration(minutes) {
    var hours = Math.floor(minutes / 60), remainder = minutes % 60;
    return (hours ? hours + 'h ' : '') + remainder + 'm';
  }

  function formatMeta(value) {
    return String(value || '').replace(/\b(\d+) min\b/g, function (match, minutes) { return duration(Number(minutes)); });
  }

  function crawl(config, request, done) {
    function graphql(query, variables, callback) {
      request('POST', 'https://api.graphql.imdb.com/', {
        'Content-Type': 'application/json', Accept: 'application/json', 'x-imdb-client-name': 'imdb-web-next'
      }, JSON.stringify({query: query, variables: variables}), function (err, body) {
        if (err) { callback(new Error('IMDb: ' + err.message)); return; }
        if (body.errors && body.errors.length) {
          var message = body.errors[0].message || 'Unknown error';
          callback(new Error(/FORBIDDEN|Permission denied/i.test(message)
              ? 'IMDb denied access to this watchlist. Check the user ID and public visibility.' : 'IMDb: ' + message));
          return;
        }
        callback(null, body.data || {});
      });
    }
    function collect(userId) {
      var entries = [], seen = {}, cursors = {};
      function page(after) {
        graphql(LIST_QUERY, {userId: userId, first: 250, after: after}, function (err, data) {
          if (err) { done(err); return; }
          var connection = data.predefinedList && data.predefinedList.items;
          if (!connection || !Array.isArray(connection.edges) || !connection.pageInfo) {
            done(new Error('IMDb did not return a public watchlist.')); return;
          }
          var edges = connection.edges;
          for (var index = 0; index < edges.length; index++) {
            var node = edges[index].node || {}, title = node.listItem || {};
            if (!/^tt\d+$/.test(title.id || '') || seen[title.id]) continue;
            seen[title.id] = true;
            var type = title.titleType && title.titleType.id;
            entries.push({imdbId: title.id, title: title.titleText && title.titleText.text || title.id,
              kind: /^(tvSeries|tvMiniSeries)$/.test(type) ? 'tv' : type === 'tvEpisode' ? 'episode' : 'movie',
              year: title.releaseYear && title.releaseYear.year, addedAt: node.createdDate || '',
              rank: entries.length, poster: title.primaryImage && title.primaryImage.url || '',
              note: (node.description && node.description.originalText && node.description.originalText.plainText || '').trim()});
          }
          var info = connection.pageInfo;
          if (!info.hasNextPage) { done(null, entries); return; }
          if (!edges.length || !info.endCursor || cursors[info.endCursor]) {
            done(new Error('IMDb pagination stopped advancing; keeping the previous complete watchlist.')); return;
          }
          cursors[info.endCursor] = true;
          page(info.endCursor);
        });
      }
      page(null);
    }
    if (/^ur\d+$/.test(config.imdbUserId)) { collect(config.imdbUserId); return; }
    graphql(PROFILE_QUERY, {profileId: config.imdbUserId}, function (err, data) {
      if (err) { done(err); return; }
      if (!data.userProfile || !/^ur\d+$/.test(data.userProfile.userId)) {
        done(new Error('IMDb profile was not found. Check imdb_user_id.')); return;
      }
      collect(data.userProfile.userId);
    });
  }

  function plexBase(config) { return 'http://' + config.plexHost + ':' + (config.plexPort || 32400); }

  function plexURL(config, path) {
    return plexBase(config) + path + (config.plexToken
        ? (path.indexOf('?') < 0 ? '?' : '&') + 'X-Plex-Token=' + encodeURIComponent(config.plexToken) : '');
  }

  function scanPlex(config, request, done) {
    if (!config.plexHost || (config.watchlistServices || []).indexOf('plex') < 0) {
      done(null, {items: {}, at: Date.now(), linksVersion: 1}); return;
    }
    function get(path, callback) {
      request('GET', plexBase(config) + path, config.plexToken
          ? {Accept: 'application/json', 'X-Plex-Token': config.plexToken} : {Accept: 'application/json'}, null,
          function (err, data) {
            if (err) { callback(new Error('Plex: ' + err.message)); return; }
            if (!data.MediaContainer) { callback(new Error('Plex returned no library data.')); return; }
            callback(null, data.MediaContainer);
          });
    }
    get('/', function (err, identity) {
      if (err) { done(err); return; }
      var library = {items: {}, machine: identity.machineIdentifier, at: Date.now(), linksVersion: 1};
      if (!library.machine) { done(new Error('Plex server identity is missing.')); return; }
      get('/library/sections', function (sectionError, container) {
        if (sectionError) { done(sectionError); return; }
        if (!Array.isArray(container.Directory) && container.size !== 0) {
          done(new Error('Plex returned an incomplete library list; keeping its previous data.')); return;
        }
        var sections = (container.Directory || []).filter(function (section) {
          return section.type === 'movie' || section.type === 'show';
        }), sectionIndex = 0;
        function nextSection() {
          if (sectionIndex >= sections.length) { done(null, library); return; }
          var section = sections[sectionIndex++], offset = 0;
          function page() {
            get('/library/sections/' + encodeURIComponent(section.key) + '/all?includeGuids=1'
                + '&X-Plex-Container-Start=' + offset + '&X-Plex-Container-Size=200', function (pageError, data) {
              if (pageError) { done(pageError); return; }
              if (!Array.isArray(data.Metadata) && data.size !== 0 && data.totalSize !== 0) {
                done(new Error('Plex returned incomplete library contents; keeping its previous data.')); return;
              }
              var items = data.Metadata || [];
              if (data.offset !== undefined && Number(data.offset) !== offset) {
                done(new Error('Plex pagination returned the wrong offset.')); return;
              }
              for (var index = 0; index < items.length; index++) {
                var item = items[index];
                if (!item.ratingKey || (item.type !== 'movie' && item.type !== 'show')) continue;
                if (item.type === 'show' ? !(item.leafCount > 0) : !item.Media || !item.Media.length) continue;
                var match = {ratingKey: String(item.ratingKey), title: item.title, kind: item.type === 'show' ? 'tv' : 'movie',
                  art: item.art || item.thumb || '', year: item.year, machine: library.machine};
                var guids = (item.Guid || []).slice();
                if (item.guid) guids.push({id: item.guid});
                for (var guidIndex = 0; guidIndex < guids.length; guidIndex++) {
                  var guid = guids[guidIndex].id || '';
                  if (/^plex:\/\/(?:movie|show)\/[a-f0-9]{24}$/i.test(guid)) match.guid = guid;
                  var imdb = /imdb:\/\/(tt\d+)/.exec(guid);
                  var tmdb = /(?:tmdb|themoviedb):\/\/(\d+)/.exec(guid);
                  if (imdb) library.items['imdb:' + imdb[1]] = match;
                  if (tmdb) library.items[match.kind + ':' + tmdb[1]] = match;
                }
              }
              offset += items.length;
              if (data.totalSize !== undefined ? offset < Number(data.totalSize) : items.length === 200) {
                if (!items.length) { done(new Error('Plex pagination ended before the full library.')); return; }
                page();
              } else nextSection();
            });
          }
          page();
        }
        nextSection();
      });
    });
  }

  function decodeHTML(value) {
    return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  function plexTarget(config, snapshot, imdbId, request, done) {
    if (!valid(snapshot, config) || !/^tt\d+$/.test(imdbId || '') || !config.plexHost) {
      done(new Error('Plex title data is unavailable.')); return;
    }
    var entry = null;
    for (var index = 0; index < snapshot.entries.length; index++) {
      if (snapshot.entries[index].imdbId === imdbId) { entry = snapshot.entries[index]; break; }
    }
    var items = snapshot.plex && snapshot.plex.items || {}, resolved = entry && entry.resolved;
    var local = entry && (items['imdb:' + imdbId] || resolved && items[resolved.kind + ':' + resolved.id]);
    if (!local || !/^\d+$/.test(local.ratingKey || '')) {
      done(new Error('Plex library match is unavailable.')); return;
    }
    if (/^plex:\/\/(?:movie|show)\/[a-f0-9]{24}$/i.test(local.guid || '')) { done(null, local.guid); return; }
    request('GET', plexBase(config) + '/library/metadata/' + encodeURIComponent(local.ratingKey) + '?includeGuids=1',
      config.plexToken ? {Accept: 'application/json', 'X-Plex-Token': config.plexToken} : {Accept: 'application/json'}, null,
      function (err, data) {
        if (err) { done(err); return; }
        var metadata = data && data.MediaContainer && data.MediaContainer.Metadata || [], item = metadata[0];
        var guids = item && item.Guid || [], matched = false;
        for (var guidIndex = 0; guidIndex < guids.length; guidIndex++) {
          if (guids[guidIndex].id === 'imdb://' + imdbId || resolved
              && guids[guidIndex].id === 'tmdb://' + resolved.id) matched = true;
        }
        if (!item || !matched || String(item.ratingKey) !== String(local.ratingKey)
            || !/^plex:\/\/(?:movie|show)\/[a-f0-9]{24}$/i.test(item.guid || '')) {
          done(new Error('Plex returned no matching native title link.')); return;
        }
        local.guid = item.guid;
        done(null, item.guid);
      });
  }

  function providerLinks(html) {
    var links = {}, expression = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi, match;
    while ((match = expression.exec(html))) {
      var url = decodeHTML(match[1]), destination = /[?&]r=([^&]+)/.exec(url);
      if (destination) {
        try { url = decodeURIComponent(destination[1]); } catch (err) { continue; }
      }
      var netflix = /^https?:\/\/(?:www\.)?netflix\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:title|watch)\/(\d+)/i.exec(url);
      if (netflix) links.netflix = 'https://www.netflix.com/watch/' + netflix[1];
      if (/^https?:\/\/(?:www\.)?mubi\.com\/(?:[a-z]{2}\/)?(?:films|movies)\//i.test(url)) links.mubi = url;
    }
    return links;
  }

  function resolve(config, entry, request, done) {
    var key = (config.tmdbKey || '').trim();
    if (!key || entry.kind === 'episode') { done(null, null); return; }
    function tmdb(path, callback) {
      var bearer = key.indexOf('eyJ') === 0;
      request('GET', 'https://api.themoviedb.org/3' + path
          + (bearer ? '' : (path.indexOf('?') < 0 ? '?' : '&') + 'api_key=' + encodeURIComponent(key)),
          bearer ? {Accept: 'application/json', Authorization: 'Bearer ' + key} : {Accept: 'application/json'}, null, callback);
    }
    var language = !config.language || config.language === 'auto' ? 'en' : config.language;
    function details(kind, item) {
      tmdb('/' + kind + '/' + item.id + '?language=' + encodeURIComponent(language)
          + '&append_to_response=watch/providers', function (detailError, detail) {
        if (detailError) { done(new Error('TMDB: ' + detailError.message)); return; }
        var providers = detail['watch/providers'], here = providers && providers.results
            && providers.results[(config.tmdbRegion || 'US').toUpperCase()];
        var flat = here && here.flatrate || [], services = [];
        for (var index = 0; index < flat.length; index++) {
          var name = (flat[index].provider_name || '').toLowerCase();
          for (var service in PROVIDERS) {
            if (PROVIDERS.hasOwnProperty(service) && name.indexOf(service) >= 0
                && (config.watchlistServices || []).indexOf(service) >= 0 && services.indexOf(service) < 0) services.push(service);
          }
        }
        var backdrop = detail.backdrop_path || item.backdrop_path;
        var result = {id: item.id, kind: kind, title: detail.title || detail.name || entry.title,
          backdrop: backdrop || detail.poster_path || '', services: services, links: {},
          meta: [entry.year, detail.genres && detail.genres[0] && detail.genres[0].name,
            kind === 'movie' && detail.runtime ? duration(detail.runtime) : ''].filter(Boolean).join(' · ')};
        if (!services.length) { done(null, result); return; }
        request('GET', 'https://www.themoviedb.org/' + kind + '/' + item.id + '/watch?locale='
            + encodeURIComponent((config.tmdbRegion || 'US').toUpperCase()), {Accept: 'text/html'}, null,
            function (linkError, html) {
              if (!linkError && typeof html === 'string') result.links = providerLinks(html);
              done(null, result);
            });
      });
    }
    if (entry.resolved && entry.resolved.id && /^(movie|tv)$/.test(entry.resolved.kind)) {
      details(entry.resolved.kind, entry.resolved);
      return;
    }
    tmdb('/find/' + entry.imdbId + '?external_source=imdb_id&language=' + encodeURIComponent(language), function (err, found) {
      if (err) { done(new Error('TMDB: ' + err.message)); return; }
      var kind = found.movie_results && found.movie_results.length ? 'movie' : 'tv';
      var item = (kind === 'movie' ? found.movie_results : found.tv_results || [])[0];
      if (!item) { done(null, null); return; }
      details(kind, item);
    });
  }

  function picksFrom(config, entries, library) {
    var picks = [];
    for (var index = 0; index < entries.length; index++) {
      var entry = entries[index], resolved = entry.resolved;
      if (entry.kind === 'episode') continue;
      var local = library.items['imdb:' + entry.imdbId]
          || (resolved && library.items[resolved.kind + ':' + resolved.id]);
      var options = [];
      if (local) options.push({app: 'plex', service: 'Plex', url: local.guid || ''});
      for (var serviceIndex = 0; resolved && serviceIndex < resolved.services.length; serviceIndex++) {
        var service = resolved.services[serviceIndex];
        options.push({app: service, service: PROVIDERS[service], url: resolved.links[service] || ''});
      }
      if (!options.length && (!entry.checkedAt || !library.at && config.plexHost
          && (config.watchlistServices || []).indexOf('plex') >= 0)) continue;
      var backdrop = resolved && resolved.backdrop;
      if (backdrop) backdrop = 'https://image.tmdb.org/t/p/w1280' + backdrop;
      else backdrop = local && local.art ? plexURL(config, local.art) : entry.poster;
      picks.push({id: entry.imdbId, imdbId: entry.imdbId, kind: resolved ? resolved.kind : local ? local.kind : entry.kind,
        title: resolved && resolved.title || local && local.title || entry.title, backdrop: backdrop,
        meta: formatMeta(resolved && resolved.meta || String(entry.year || '')), note: entry.note || '',
        options: options, rank: entry.rank, addedAt: entry.addedAt});
    }
    return picks;
  }

  function sync(config, previous, request, progress, done, force) {
    previous = valid(previous, config) ? previous : null;
    var warnings = [], entriesAt = 0, snapshotAt = previous ? previous.updatedAt : 0;
    function libraryData(callback) {
      if (!force && previous && plexLinksReady(previous) && fresh(previous.plex.at)) { callback(null, previous.plex); return; }
      scanPlex(config, request, callback);
    }
    function match(entries) {
      libraryData(function (plexError, library) {
        if (plexError) warnings.push(plexError.message);
        library = library || previous && previous.plex || {items: {}, at: 0};
        var old = {}, entriesDone = 0, nextIndex = 0, active = 0, stopped = false, timer = 0, progressAt = Date.now();
        if (previous) previous.entries.forEach(function (entry) { old[entry.imdbId] = entry; });
        entries.forEach(function (entry) {
          var cached = old[entry.imdbId];
          if (cached) { entry.resolved = cached.resolved; entry.checkedAt = cached.checkedAt; }
        });
        function snapshot() {
          snapshotAt = Math.max(Date.now(), snapshotAt + 1);
          return {schema: SCHEMA, catalogVersion: 1, source: source(config), updatedAt: snapshotAt, entriesAt: entriesAt,
            entries: entries, plex: library, picks: picksFrom(config, entries, library), warnings: warnings};
        }
        function schedule() {
          if (!timer && !stopped) timer = setTimeout(function () { timer = 0; pump(); }, 50);
        }
        function pump() {
          if (stopped) return;
          if (entriesDone === entries.length) { stopped = true; done(null, snapshot()); return; }
          var batch = 0;
          while (active < 2 && nextIndex < entries.length && batch++ < 25) {
            (function (entry) {
              active++;
              var cached = old[entry.imdbId];
              function finish(err, result) {
                if (err) {
                  if (warnings.indexOf(err.message) < 0) warnings.push(err.message);
                  if (cached) { entry.resolved = cached.resolved; entry.checkedAt = cached.checkedAt; }
                } else { entry.resolved = result; entry.checkedAt = Date.now(); }
                entriesDone++;
                active--;
                if (progress && Date.now() - progressAt >= 5000) {
                  progressAt = Date.now();
                  progress(snapshot());
                }
                schedule();
              }
              if (cached && fresh(cached.checkedAt) && !force) {
                entry.resolved = cached.resolved;
                entry.checkedAt = cached.checkedAt;
                entriesDone++;
                active--;
              } else resolve(config, entry, request, finish);
            })(entries[nextIndex++]);
          }
          if (active < 2 && (nextIndex < entries.length || entriesDone === entries.length)) schedule();
        }
        if (progress) progress(snapshot());
        pump();
      });
    }
    if (!config.imdbUserId) { done(new Error('Set imdb_user_id in config.properties.')); return; }
    if (previous && fresh(previous.entriesAt) && notesReady(previous) && !force) {
      entriesAt = previous.entriesAt;
      match(previous.entries.map(function (entry) {
        var copy = {};
        for (var key in entry) if (entry.hasOwnProperty(key)) copy[key] = entry[key];
        return copy;
      }));
      return;
    }
    crawl(config, request, function (err, entries) {
      if (err) {
        if (!previous) { done(err); return; }
        warnings.push(err.message);
        entriesAt = previous.entriesAt;
        match(previous.entries);
        return;
      }
      entriesAt = Date.now();
      match(entries);
    });
  }

  function select(picks, kind, available, seed, limit) {
    var ranked = [];
    for (var index = 0; index < picks.length; index++) {
      var pick = picks[index];
      if (kind && kind !== 'unavailable' && kind !== pick.kind) continue;
      var option = null;
      if (kind === 'unavailable') {
        if (pick.options.length) continue;
        option = {app: '', service: '', url: ''};
      } else {
        for (var optionIndex = 0; optionIndex < pick.options.length; optionIndex++) {
          if (available(pick.options[optionIndex].app)) { option = pick.options[optionIndex]; break; }
        }
      }
      if (!option) continue;
      var hash = parseInt(fingerprint(pick.imdbId + ':' + seed + ':' + kind), 16);
      var uniform = (hash + 1) / 4294967297;
      var weight = 1 / Math.pow(1 + Math.max(0, pick.rank || 0) / 50, 0.8);
      if (option.app === 'plex') weight *= 1.5;
      ranked.push({pick: pick, option: option, score: -Math.log(uniform) / weight});
    }
    ranked.sort(function (left, right) { return left.score - right.score; });
    return ranked.slice(0, limit === null ? ranked.length : limit === undefined ? 3 : limit).map(function (item) {
      var result = {}, pick = item.pick;
      for (var key in pick) if (pick.hasOwnProperty(key)) result[key] = pick[key];
      result.app = item.option.app;
      result.service = item.option.service;
      result.url = item.option.url;
      result.meta = [formatMeta(pick.meta), result.service].filter(Boolean).join(' · ');
      return result;
    });
  }

  function browse(picks, kind, available, seed) {
    var list = select(picks, kind, available, seed, null);
    function compareIds(left, right) {
      var first = String(left.imdbId || left.id), second = String(right.imdbId || right.id);
      return first < second ? -1 : first > second ? 1 : 0;
    }
    if (kind) {
      return list.sort(function (left, right) {
        var leftAt = Date.parse(left.addedAt || '') || 0, rightAt = Date.parse(right.addedAt || '') || 0;
        return rightAt - leftAt || (left.rank || 0) - (right.rank || 0) || compareIds(left, right);
      });
    }
    list.sort(compareIds);
    var random = parseInt(fingerprint(seed + ':browse'), 16) || 88675123;
    for (var position = list.length - 1; position > 0; position--) {
      random ^= random << 13;
      random ^= random >>> 17;
      random ^= random << 5;
      var target = Math.floor((random >>> 0) / 4294967296 * (position + 1));
      var temporary = list[position];
      list[position] = list[target];
      list[target] = temporary;
    }
    return list;
  }

  return {source: source, valid: valid, fresh: fresh, notesReady: notesReady, plexLinksReady: plexLinksReady,
    availabilityReady: availabilityReady, clientSnapshot: clientSnapshot,
    crawl: crawl, scanPlex: scanPlex, plexTarget: plexTarget, providerLinks: providerLinks,
    sync: sync, select: select, browse: browse};
});
