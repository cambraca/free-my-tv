/* Browser preview URL state shared by the responsive and TV layouts. */
var PreviewLocation = (function () {
  'use strict';

  function read() {
    var hash = window.location.hash || '';
    var tab = /(?:^#|&)tab=(explore|movie|tv|unavailable|watched)(?:&|$)/.exec(hash);
    var title = /(?:^#|&)title=(tt\d+)(?:&|$)/.exec(hash);
    return {tab: tab ? (tab[1] === 'explore' ? 'all' : tab[1]) : '', title: title ? title[1] : ''};
  }

  function write(tab, title) {
    var hash = '#tab=' + (tab === 'all' ? 'explore' : tab);
    if (/^tt\d+$/.test(title || '')) hash += '&title=' + title;
    if (window.location.hash !== hash) window.history.replaceState(window.history.state, '', hash);
  }

  return {read: read, write: write};
})();
