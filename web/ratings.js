/* Shared by the TV layout and the responsive browser preview. */
var TitleRatings = (function () {
  'use strict';

  function render(row, pick, extra, layout) {
    var focused = row.contains(document.activeElement) && document.activeElement.href;
    row.textContent = '';
    extra = extra || {};
    var tmdb = extra.tmdb && extra.tmdb.checkedAt > (pick.tmdbRatingCheckedAt || 0)
      ? extra.tmdb : {score: pick.rating === 0 && !pick.tmdbRatingCheckedAt ? null : pick.rating, id: pick.tmdbId};
    var imdb = extra.imdb && extra.imdb.checkedAt > (pick.imdbRatingCheckedAt || 0) ? extra.imdb.score : pick.imdbRating;
    var rt = extra.rottenTomatoes || {};
    var metacritic = extra.metacritic || {};
    var letterboxd = extra.letterboxd || {};
    var tmdbId = tmdb.id || pick.tmdbId;
    var tmdbUrl = /^(movie|tv)$/.test(pick.kind) && /^[1-9]\d*$/.test(tmdbId || '')
      ? 'https://www.themoviedb.org/' + pick.kind + '/' + tmdbId : '';
    var imdbUrl = /^tt\d+$/.test(pick.imdbId || '') ? 'https://www.imdb.com/title/' + pick.imdbId + '/' : '';
    var rtUrl = /^(m|tv)\/[a-z0-9_-]+$/.test(rt.id || '') ? 'https://www.rottentomatoes.com/' + rt.id : '';
    var metacriticUrl = /^(movie|tv)\/[a-z0-9_-]+$/.test(metacritic.id || '') ? 'https://www.metacritic.com/' + metacritic.id + '/' : '';
    var letterboxdUrl = /^[a-z0-9_-]+$/.test(letterboxd.id || '') ? 'https://letterboxd.com/film/' + letterboxd.id + '/' : '';
    function add(label, value, url, icon) {
      var link = layout === 'preview' && url;
      var node = document.createElement(link ? 'a' : 'span');
      node.textContent = '★ ' + value + '\u00a0';
      node.title = label;
      var logo = document.createElement('img');
      logo.alt = label;
      if (layout === 'tv') logo.height = 26;
      logo.onerror = function () {
        node.replaceChild(document.createTextNode(label), logo);
      };
      logo.src = 'logos/ratings/' + icon;
      node.appendChild(logo);
      if (link) {
        node.href = url;
        node.target = '_blank';
        node.rel = 'noopener noreferrer';
      }
      row.appendChild(node);
      if (link && focused === url) node.focus();
    }
    if (typeof imdb === 'number' && imdb > 0 && imdb <= 10) add('IMDb', imdb.toFixed(1), imdbUrl, 'imdb.svg');
    if (typeof tmdb.score === 'number' && tmdb.score >= 0 && tmdb.score <= 10) {
      add('TMDB', Math.round(tmdb.score * 10) + '%', tmdbUrl, 'tmdb.svg');
    }
    if (typeof rt.score === 'number' && rt.score >= 0 && rt.score <= 100) {
      add('Rotten Tomatoes', rt.score + '%', rtUrl, 'rottentomatoes.svg');
    }
    if (typeof metacritic.score === 'number' && metacritic.score >= 0 && metacritic.score <= 100) {
      add('Metacritic', String(metacritic.score), metacriticUrl, 'metacritic.svg');
    }
    if (typeof letterboxd.score === 'number' && letterboxd.score >= 0.5 && letterboxd.score <= 5) {
      add('Letterboxd', letterboxd.score.toFixed(1), letterboxdUrl, 'letterboxd.svg');
    }
  }

  return {render: render};
})();
