'use strict';
const Watchlist = require('../web/watchlist');

// Read-only enrichment of watchlist titles. Never crawl providers or change snapshots here.
module.exports = function (config, getSnapshot, request) {
  const cache = new Map(), pending = new Map();
  return function details(imdbId, done) {
    const pick = getSnapshot()?.picks.find(item => item.imdbId === imdbId);
    if (!pick) { done(new Error('Title is no longer in the watchlist.')); return; }
    if ((pick.detailsLoaded && typeof pick.trailer === 'string' && pick.credits) || !config.tmdbKey) { done(null, pick); return; }
    if (cache.has(imdbId)) { done(null, {...pick, ...cache.get(imdbId)}); return; }
    if (pending.has(imdbId)) { pending.get(imdbId).push(done); return; }
    pending.set(imdbId, [done]);
    function finish(error, metadata) {
      if (!error && metadata) {
        cache.set(imdbId, metadata);
        if (cache.size > 200) cache.delete(cache.keys().next().value);
      }
      const callbacks = pending.get(imdbId); pending.delete(imdbId);
      callbacks.forEach(callback => callback(error, {...pick, ...metadata}));
    }
    const language = config.language && config.language !== 'auto' ? config.language : 'en';
    function tmdb(path, callback) {
      const key = config.tmdbKey.trim(), bearer = key.startsWith('eyJ');
      request('GET', 'https://api.themoviedb.org/3' + path + (path.includes('?') ? '&' : '?')
        + 'language=' + encodeURIComponent(language) + (bearer ? '' : '&api_key=' + encodeURIComponent(key)),
        bearer ? {Accept: 'application/json', Authorization: 'Bearer ' + key} : {Accept: 'application/json'}, null, callback);
    }
    function load(id) {
      tmdb('/' + pick.kind + '/' + id + '?append_to_response=videos,credits&include_video_language=en,'
        + encodeURIComponent(language.split('-')[0]), (error, detail) => {
        if (error) { finish(new Error('Could not load title details.')); return; }
        if (!detail || Number(detail.id) !== Number(id)) { finish(new Error('Title details are unavailable.')); return; }
        finish(null, {poster: detail.poster_path ? 'https://image.tmdb.org/t/p/w500' + detail.poster_path : pick.poster,
          backdrop: detail.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + detail.backdrop_path : pick.backdrop,
          overview: detail.overview || '', genres: (detail.genres || []).map(genre => genre.name),
          rating: detail.vote_count > 0 ? Number(detail.vote_average) || 0 : 0,
          trailer: Watchlist.trailer(detail.videos, language), credits: Watchlist.credits(detail, pick.kind),
          seasons: Number(detail.number_of_seasons) || pick.seasons, episodes: Number(detail.number_of_episodes) || pick.episodes,
          detailsLoaded: true});
      });
    }
    if (!['movie', 'tv'].includes(pick.kind)) { finish(null); return; }
    if (pick.tmdbId) { load(pick.tmdbId); return; }
    tmdb('/find/' + encodeURIComponent(imdbId) + '?external_source=imdb_id', (error, found) => {
      if (error) { finish(new Error('Could not load title details.')); return; }
      const match = found?.[pick.kind === 'tv' ? 'tv_results' : 'movie_results']?.[0];
      if (match) load(match.id); else finish(null);
    });
  };
};
