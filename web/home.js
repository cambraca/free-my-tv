/*
 * The home screen for web-app TVs (LG webOS, Samsung Tizen), with the Android app's design and behavior (HomeView):
 *  - top: the title, Explore/Movies/Shows tabs and Settings;
 *  - three weighted watchlist picks per launch; the background is the first one's photo, blurred and almost white;
 *  - the glass shelf with the apps; ↓ opens the selected tab's scrollable watchlist and compact weather;
 *  - a night look from sunset to sunrise; a screensaver after a few idle minutes.
 * The remote's arrows, OK and Back move the focus; a pointer (LG's Magic Remote) focuses what it points at.
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function sym(name, parent, size) {
    var s = el('span', 'sym', parent);
    s.style.webkitMaskImage = 'url(symbols/' + name + '.png)';
    s.style.maskImage = 'url(symbols/' + name + '.png)';
    if (size) { s.style.width = size + 'px'; s.style.height = size + 'px'; }
    return s;
  }

  // function coin(i, parent) {
  //   var c = window.COINS && window.COINS[i];
  //   if (!c) return;
  //   var ns = 'http://www.w3.org/2000/svg';
  //   var svg = document.createElementNS(ns, 'svg');
  //   svg.setAttribute('viewBox', '0 0 32 32');
  //   for (var k = 0; k < c.length; k++) {
  //     var p = document.createElementNS(ns, 'path');
  //     p.setAttribute('d', c[k]);
  //     p.setAttribute('fill-rule', 'evenodd');
  //     svg.appendChild(p);
  //   }
  //   parent.appendChild(svg);
  // }

  function hasClass(e, c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0; }
  function setClass(e, c, on) {
    if (!e) return;
    if (on && !hasClass(e, c)) e.className = (e.className + ' ' + c).replace(/^\s+/, '');
    else if (!on && hasClass(e, c)) e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  var stage = $('stage'), body = document.body;

  /** The 1920 × 1080 stage fills the window (on the TV it already is 1920 × 1080). */
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.webkitTransform = stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
  }

  // MARK: - Apps on the shelf

  /** Shelf apps in this order when installed, like the Android app: key, LG app id, name on the TV, primary brand color. */
  var SHELF = [
    ['netflix', /^netflix$/, /netflix/i, '#000000'],
    ['youtube', /youtube/, /^youtube$/i, '#000000'],
    ['mubi', /^com\.mubi$|^mubi$/, /^mubi$/i, '#000000'],
    ['spotify', /spotify/, /spotify/i, '#000000'],
    ['plex', /^cdp-30$|plex/, /plex/i, '#000000']
    // ['max', /hbo|wbd/, /^(hbo )?max$|hbo max/i, '#6C3BE0'],
    // ['prime', /^amazon$/, /prime video|amazon/i, '#00A8E1'],
    // ['disney', /disney/, /disney/i, '#113CCF'],
    // ['appletv', /appletv|apple\.tv/, /apple tv/i, '#000000'],
    // ['hulu', /^hulu/, /hulu/i, '#1CE783'],
    // ['paramount', /paramount|cbs/, /paramount/i, '#0064FF'],
    // ['peacock', /peacock/, /peacock/i, '#000000'],
    // ['globoplay', /globoplay/, /globoplay/i, '#FF5A1F']
  ];
  var LOGOS = {
    netflix: {src: 'logos/netflix.png'},
    youtube: {src: 'logos/youtube.png'},
    mubi: {src: 'logos/mubi.png', invert: true},
    spotify: {src: 'logos/spotify.png'},
    plex: {src: 'logos/plex.png'}
  };
  var MAX_SHELF = 8;

  function shelfKey(app) {
    for (var i = 0; i < SHELF.length; i++) if (SHELF[i][1].test(app.id) || SHELF[i][2].test(app.title)) return SHELF[i];
    return null;
  }

  function darken(hex, f) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#161618';
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ')';
  }

  /** A name that fits the tile on one line (the font shrinks for long names). */
  function wordFit(title, width, max) {
    return Math.max(18, Math.min(max, Math.floor(width * 0.8 / (Math.max(4, title.length) * 0.56))));
  }

  /** An app's face: its own icon on its brand color (or its name, when the icon can't be read). */
  function face(app, box, wordSize) {
    var k = shelfKey(app);
    var color = k ? k[3] : app.color;
    var top = color || '#2A2A2E';
    var bottom = color ? darken(color, 0.68) : '#161618';
    box.style.background = '-webkit-linear-gradient(top, ' + top + ', ' + bottom + ')';
    box.style.background = 'linear-gradient(' + top + ', ' + bottom + ')';
    var word = el('div', 'word', box, app.title);
    var logo = k && LOGOS[k[0]];
    if (wordSize) word.style.fontSize = wordSize + 'px';
    if (logo || app.icon) {
      var img = el('img', '', box);
      word.style.visibility = 'hidden';
      img.onerror = function () { img.parentNode.removeChild(img); word.style.visibility = ''; };
      if (logo && logo.invert) img.style.webkitFilter = img.style.filter = 'invert(1)';
      img.src = logo ? logo.src : app.icon;
    }
  }

  var apps = [], shelf = [], others = [];
  // var inputs = [];

  function pickShelf() {
    var chosen = Prefs.shelf(), out = [];
    if (chosen) {
      for (var i = 0; i < chosen.length && out.length < MAX_SHELF; i++) {
        for (var j = 0; j < apps.length; j++) if (apps[j].id === chosen[i]) out.push(apps[j]);
      }
    } else {
      for (var s = 0; s < SHELF.length && out.length < MAX_SHELF; s++) {
        for (var a = 0; a < apps.length; a++) {
          if ((SHELF[s][1].test(apps[a].id) || SHELF[s][2].test(apps[a].title)) && out.indexOf(apps[a]) < 0) { out.push(apps[a]); break; }
        }
      }
      if (!out.length) out = apps.slice(0, MAX_SHELF);
    }
    shelf = out;
    others = apps.filter(function (x) { return shelf.indexOf(x) < 0; });
  }

  // MARK: - Focus

  var Z = {TOP: 'top', CARDS: 'cards', SHELF: 'shelf', DRAWER: 'drawer', APPS: 'apps', SETTINGS: 'settings', EDIT: 'edit', DETAILS: 'details'};
  var st = {zone: Z.SHELF, top: 0, tab: Prefs.tab(), card: 0, shelf: 0, drawer: 0, first: 0, browsing: false, grid: 0, row: 0, edit: 0};
  var cards = [];

  function sheetOpen() { return st.zone === Z.APPS || st.zone === Z.SETTINGS || st.zone === Z.EDIT || st.zone === Z.DETAILS; }

  function updateFocus() {
    var i, list;
    list = $('tabs').children;
    for (i = 0; i < list.length; i++) {
      setClass(list[i], 'on', i === st.tab);
      setClass(list[i], 'focus', st.zone === Z.TOP && st.top === i);
    }
    list = $('buttons').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.TOP && st.top === TAB_KIND.length + i);
    // setClass($('quotes'), 'hide', st.zone === Z.TOP && st.top >= 3);
    list = $('cards').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.CARDS && st.card === i);
    list = $('tiles').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.SHELF && st.shelf === i);
    if (st.browsing) {
      var browseRow = Math.floor(st.drawer / BROWSE_COLUMNS), totalRows = Math.ceil(browsePicks.length / BROWSE_COLUMNS);
      if (browseRow < st.first) st.first = browseRow;
      if (browseRow >= st.first + BROWSE_ROWS) st.first = browseRow - BROWSE_ROWS + 1;
      st.first = Math.max(0, Math.min(Math.max(0, totalRows - BROWSE_ROWS), st.first));
      browsePositions[st.tab] = {index: st.drawer, first: st.first};
      renderBrowseWindow();
    }
    list = document.querySelectorAll('#apps .cell');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.APPS && st.grid === i);
    var rows = Math.max(1, Math.ceil(others.length / 5)), r = Math.floor(st.grid / 5), first = Math.max(0, Math.min(rows - 3, r - 1));
    $('apps').lastChild.style.webkitTransform = $('apps').lastChild.style.transform = 'translateY(' + (-first * 239) + 'px)';
    focusRows($('settings'), st.row, st.zone === Z.SETTINGS);
    focusRows($('shelfedit'), st.edit, st.zone === Z.EDIT);
    setClass(body, 'drawer-open', st.browsing);
  }

  function focusRows(sheet, index, on) {
    var rows = sheet.querySelectorAll('.row');
    for (var i = 0; i < rows.length; i++) setClass(rows[i], 'focus', on && i === index);
    var holder = sheet.querySelector('.rows');
    if (!holder) return;
    var visible = 7, first = Math.max(0, Math.min(rows.length - visible, index - 3));
    holder.style.webkitTransform = holder.style.transform = 'translateY(' + (-first * 78) + 'px)';
  }

  function nearest(nodes, x) {
    var best = 0, bestD = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect(), d = Math.abs((r.left + r.right) / 2 - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function centerX(node) {
    if (!node) return 960;
    var r = node.getBoundingClientRect();
    return (r.left + r.right) / 2;
  }

  // MARK: - Top: title, tabs, buttons, quotes

  var TAB_KIND = [null, 'movie', 'tv', 'unavailable'];

  function renderTop() {
    $('title').textContent = 'TV';
    if (window.APP_VERSION) el('span', 'version', $('title'), 'v' + window.APP_VERSION);
    var tabs = $('tabs');
    tabs.innerHTML = '';
    var names = [tr('Explorar', 'Explore', 'Explorar'), tr('Filmes', 'Movies', 'Películas'), tr('Séries', 'Shows', 'Series'),
      tr('Indisponíveis', 'Unavailable', 'No disponibles')];
    for (var i = 0; i < TAB_KIND.length; i++) {
      var t = el('button', 'tab', tabs, names[i]);
      hover(t, Z.TOP, i);
    }
    var buttons = $('buttons');
    buttons.innerHTML = '';
    var defs = [
      // ['live_tv', tr('TV aberta', 'Live TV', 'TV en vivo')],
      // ['hdmi', tr('Entradas HDMI', 'HDMI Inputs', 'Entradas HDMI')],
      ['settings', tr('Ajustes', 'Settings', 'Ajustes')]
    ];
    for (var b = 0; b < defs.length; b++) {
      var r = el('button', 'round last', buttons);
      r.style.left = '1772px';
      sym(defs[b][0], r);
      el('div', 'tip', r, defs[b][1]);
      hover(r, Z.TOP, TAB_KIND.length + b);
    }
  }

  function renderWatchlistStatus() {
    var status = Data.watchlistStatus();
    var message = !status.configured ? tr('Configure seu usuário do IMDb em config.properties.',
        'Set your IMDb user ID in config.properties.', 'Configura tu usuario de IMDb en config.properties.')
        : status.error ? status.error : status.refreshing ? tr('Atualizando sua lista…', 'Updating your watchlist…', 'Actualizando tu lista…')
        : !status.loaded ? tr('Sua lista ainda não está disponível.', 'Your watchlist is not available yet.', 'Tu lista aún no está disponible.')
        : !Data.picks(TAB_KIND[st.tab]).length && TAB_KIND[st.tab] === 'unavailable'
          ? tr('Nenhum título indisponível.', 'No unavailable titles.', 'No hay títulos no disponibles.')
        : !Data.picks(TAB_KIND[st.tab]).length ? tr('Nenhum título da sua lista disponível nestes serviços.',
            'No watchlist titles available on your services in this tab.', 'No hay títulos de tu lista disponibles en estos servicios.') : '';
    $('watchlist-status').textContent = message;
  }

  // MARK: - Picks and background

  function renderCards() {
    var list = Data.picks(TAB_KIND[st.tab]);
    var holder = $('cards');
    setClass(body, 'no-picks', !list.length);
    var same = list.length === cards.length;
    for (var i = 0; same && i < list.length; i++) same = list[i].id === cards[i].id && list[i].backdrop === cards[i].backdrop
        && list[i].meta === cards[i].meta && list[i].title === cards[i].title && list[i].app === cards[i].app
        && list[i].url === cards[i].url && list[i].note === cards[i].note;
    if (same && holder.children.length === list.length) return;
    cards = list;
    holder.innerHTML = '';
    var rects = [[80, 1040], [1160, 320], [1520, 320]];
    for (var c = 0; c < list.length; c++) {
      var p = list[c], card = el('div', 'card', holder);
      card.style.left = rects[c][0] + 'px';
      card.style.width = rects[c][1] + 'px';
      var img = el('div', 'img', card);
      img.style.backgroundImage = 'url(' + Data.image(p.backdrop, c === 0 ? 'w1280' : 'w780') + ')';
      if (p.note) el('div', 'focus-note', img, p.note);
      el('div', 'name', card, p.title);
      if (p.meta) {
        var meta = c === 0 ? p.meta : p.meta.split(' · ').filter(function (part) {
          return /^\d/.test(part) || part === p.service;
        }).join(' · ');
        el('div', 'meta', card, meta);
      }
      hover(card, Z.CARDS, c);
    }
    st.card = Math.min(st.card, Math.max(0, list.length - 1));
    if (!list.length && st.zone === Z.CARDS) st.zone = Z.SHELF;
    backdrop(list.length ? Data.image(list[0].backdrop, 'w300') : '');
    updateFocus();
  }

  var bgUrl = null, bgFront = 'bgA';

  /** The first pick's photo as the background: drawn tiny and stretched, it's already as soft as a heavy blur. */
  function backdrop(url) {
    if (url === bgUrl) return;
    bgUrl = url;
    var next = bgFront === 'bgA' ? 'bgB' : 'bgA';
    if (!url) {
      setClass($('bgA'), 'on', false);
      setClass($('bgB'), 'on', false);
      return;
    }
    var img = new Image();
    img.onload = function () {
      if (bgUrl !== url) return;
      var canvas = $(next), ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setClass(canvas, 'on', true);
      setClass($(bgFront), 'on', false);
      bgFront = next;
    };
    img.src = url;
  }

  function renderClock() {
    var d = new Date(), c = $('clock');
    c.firstChild.textContent = Data.time(d.getTime());
    try {
      c.lastChild.textContent = d.toLocaleDateString(I18N.locale(), {weekday: 'long', day: 'numeric', month: 'long'});
    } catch (e) {
      c.lastChild.textContent = d.toDateString();
    }
  }

  // MARK: - Shelf

  function renderShelf() {
    var n = shelf.length, gap = 32, pad = 26;
    var tw = Math.min(220, (1760 - Math.max(0, n - 1) * gap) / Math.max(1, n));
    var width = n * tw + Math.max(0, n - 1) * gap, left = (1920 - width) / 2;
    var platter = $('platter');
    platter.style.display = n ? '' : 'none';
    platter.style.left = (left - pad) + 'px';
    platter.style.width = (width + 2 * pad) + 'px';
    // $('quotes').style.right = (1920 - left - width) + 'px';
    var tiles = $('tiles');
    tiles.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var t = el('div', 'tile', tiles);
      t.style.left = (left + i * (tw + gap)) + 'px';
      t.style.width = tw + 'px';
      face(shelf[i], t, wordFit(shelf[i].title, tw, 30));
      hover(t, Z.SHELF, i);
    }
    st.shelf = Math.min(st.shelf, Math.max(0, n - 1));
  }

  // MARK: - Drawer

  var BROWSE_COLUMNS = 4, BROWSE_ROWS = 2, BROWSE_STEP = 326;
  var browsePicks = [], browseNodes = {}, browseRendered = null, browseFirst = -1, browseTab = -1;
  var browsePositions = TAB_KIND.map(function () { return {index: 0, first: 0}; });

  function renderDrawer() {
    if (!st.browsing) return;
    var focused = browseTab === st.tab ? browsePicks[st.drawer] : null, list = Data.browse(TAB_KIND[st.tab]);
    if (focused && st.browsing) {
      for (var index = 0; index < list.length; index++) {
        if (list[index].id === focused.id) { st.drawer = index; break; }
      }
    }
    browsePicks = list;
    browseTab = st.tab;
    st.drawer = Math.max(0, Math.min(st.drawer, list.length - 1));
    $('browse-empty').textContent = list.length ? '' : $('watchlist-status').textContent
        || tr('Nenhum título disponível.', 'No titles available.', 'No hay títulos disponibles.');
    updateFocus();
  }

  function renderBrowseWindow() {
    var firstRow = st.first;
    var lastRow = Math.min(Math.ceil(browsePicks.length / BROWSE_COLUMNS), st.first + BROWSE_ROWS + 1);
    var start = firstRow * BROWSE_COLUMNS, end = Math.min(browsePicks.length, lastRow * BROWSE_COLUMNS);
    var grid = $('browse-grid');
    if (browseRendered !== browsePicks || browseFirst !== st.first) {
      browseRendered = browsePicks;
      browseFirst = st.first;
      for (var key in browseNodes) {
        if (!browseNodes.hasOwnProperty(key)) continue;
        var existing = browseNodes[key], existingIndex = existing.pickIndex;
        if (existingIndex < start || existingIndex >= end || existing.pick !== browsePicks[existingIndex]) {
          grid.removeChild(existing);
          delete browseNodes[key];
        }
      }
      var fragment = document.createDocumentFragment();
      for (var itemIndex = start; itemIndex < end; itemIndex++) {
        var item = browsePicks[itemIndex], card = browseNodes[itemIndex];
        if (!card) {
          card = el('div', 'browse-card', fragment);
          browseNodes[itemIndex] = card;
          card.pick = item;
          card.pickIndex = itemIndex;
          card.setAttribute('data-index', itemIndex);
          card.style.left = (20 + itemIndex % BROWSE_COLUMNS * 448) + 'px';
          var image = el('div', 'img', card);
          image.style.backgroundImage = 'url(' + Data.image(item.backdrop, 'w780') + ')';
          if (item.note) el('div', 'focus-note', image, item.note);
          el('div', 'name', card, item.title);
          el('div', 'meta', card, item.meta);
          hover(card, Z.DRAWER, itemIndex);
        }
        card.style.top = (20 + (Math.floor(itemIndex / BROWSE_COLUMNS) - firstRow) * BROWSE_STEP) + 'px';
        card.style.pointerEvents = itemIndex < (st.first + BROWSE_ROWS) * BROWSE_COLUMNS ? 'auto' : 'none';
      }
      grid.appendChild(fragment);
    }
    var nodes = grid.children;
    for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
      setClass(nodes[nodeIndex], 'focus', st.zone === Z.DRAWER && nodes[nodeIndex].pickIndex === st.drawer);
    }
  }

  function renderPanels() {
    var card = $('weather-widget');
    card.innerHTML = '';
    card.style.display = Prefs.weather() ? '' : 'none';
    if (!Prefs.weather()) return;
    el('div', 'place', card, Data.city || tr('Clima', 'Weather', 'Clima'));
    var weather = Data.weather;
    if (!weather) {
      el('div', 'condition', card, tr('Sem dados do clima agora.', 'No weather data right now.', 'No hay datos del clima ahora.'));
      return;
    }
    var current = el('div', 'current', card);
    sym(Data.symbol(weather.code, weather.isDay), current);
    el('span', 'temp', current, Data.degrees(weather.temp));
    el('div', 'condition', card, Data.condition(weather.code, weather.isDay));
    el('div', 'range', card, Data.degrees(weather.max) + ' / ' + Data.degrees(weather.min));
  }

  // function renderPrices(card, coins) {
  //   el('div', 'head', card, tr('Cotações', 'Crypto', 'Cripto'));
  //   var stale = Data.staleness(Data.pricesAt, 5 * 60000);
  //   el('div', 'side', card, stale || tr('variação em 24 h', '24h change', 'variación en 24 h'));
  //   for (var j = 0; j < coins.length; j++) {
  //     var i = coins[j], row = el('div', 'coin', card);
  //     row.style.top = (86 + 52 * j) + 'px';
  //     coin(i, row);
  //     el('span', 'n', row, Data.coinName(i));
  //     el('span', 'p', row, Data.money(Data.prices[i]));
  //     var ch = Data.changes[i];
  //     if (!isNaN(ch)) el('span', 'c ' + (ch >= 0 ? 'up' : 'down'), row, Data.change(ch));
  //   }
  // }

  function openDrawer() {
    st.browsing = true;
    st.zone = Data.browse(TAB_KIND[st.tab]).length ? Z.DRAWER : Z.SHELF;
    renderDrawer();
  }

  function closeDrawer() {
    st.browsing = false;
    st.zone = Z.SHELF;
    updateFocus();
  }

  // MARK: - All Apps

  function renderApps() {
    var sheet = $('apps');
    sheet.firstChild.textContent = tr('Todos os Apps', 'All Apps', 'Todas las apps');
    var grid = sheet.lastChild;
    grid.innerHTML = '';
    for (var i = 0; i < others.length; i++) {
      var r = Math.floor(i / 5), c = i % 5, cell = el('div', 'cell', grid);
      cell.style.left = (130 + c * 340) + 'px';
      cell.style.top = (196 + r * 239) + 'px';
      face(others[i], el('div', 'face', cell), wordFit(others[i].title, 300, 34));
      el('div', 'label', cell, others[i].title);
      hover(cell, Z.APPS, i);
    }
  }

  function openApps() {
    renderApps();
    st.zone = Z.APPS;
    st.grid = 0;
    setClass($('apps'), 'open', true);
    updateFocus();
  }

  function closeSheets() {
    detailRequest++;
    setClass($('details'), 'open', false);
    setClass($('apps'), 'open', false);
    setClass($('settings'), 'open', false);
    setClass($('shelfedit'), 'open', false);
    st.zone = Z.SHELF;
    updateFocus();
  }

  // MARK: - Settings

  var manualRefresh = false;

  function settingRows() {
    var theme = Prefs.theme();
    var watchlist = Data.watchlistStatus();
    var auto = tr('Automático', 'Automatic', 'Automático');
    var rows = [
      {label: tr('Tema', 'Theme', 'Tema'), value: theme === 'light' ? tr('Claro', 'Light', 'Claro') : theme === 'dark' ? tr('Escuro', 'Dark', 'Oscuro') : auto,
        step: function (d) { cycle('theme', ['auto', 'light', 'dark'], theme, d); checkNight(); }}
      // {label: tr('Widget de cotações', 'Quotes widget', 'Widget de cotizaciones'), toggle: Prefs.quotes(),
      //   step: function () { Prefs.set('quotes', !Prefs.quotes()); Data.settingsChanged(); }}
    ];
    rows.push({label: tr('Atualizar IMDb e Plex', 'Refresh IMDb and Plex', 'Actualizar IMDb y Plex'),
      value: watchlist.refreshing ? tr('Atualizando…', 'Refreshing…', 'Actualizando…') : '›', dim: watchlist.refreshing,
      step: function () {
        if (!Data.watchlistStatus().refreshing) { manualRefresh = true; Data.refreshWatchlist(); }
      }});
    rows.push({label: tr('Iniciar apresentação', 'Start slideshow', 'Iniciar presentación'), value: '›',
      step: function (d) { if (d >= 0) { closeSheets(); showSaver(); } }});
    rows.push({label: tr('Todos os Apps', 'All Apps', 'Todas las apps'), value: '›', step: function (d) { if (d >= 0) openApps(); }});
    rows.push({label: tr('Prateleira', 'Shelf', 'Estante'), value: '›', step: function (d) { if (d >= 0) openShelfEdit(); }});
    rows.push({label: tr('Ajustes da TV', 'TV Settings', 'Ajustes del TV'), value: '›', step: function (d) { if (d >= 0) tvSettings(); }});
    return rows;
  }

  function cycle(name, values, current, d) {
    var i = values.indexOf(current);
    Prefs.set(name, values[(i + (d || 1) + values.length) % values.length]);
  }

  var rowsNow = [];

  function renderSettings() {
    var box = $('settings').firstChild;
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('settings', title);
    title.appendChild(document.createTextNode(tr('Ajustes', 'Settings', 'Ajustes')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    rowsNow = settingRows();
    list.style.height = Math.min(rowsNow.length, 7) * 78 + 'px';
    for (var i = 0; i < rowsNow.length; i++) {
      var r = rowsNow[i], row = el('div', 'row' + (r.dim ? ' dim' : ''), holder, r.label);
      if (r.toggle !== undefined) setClass(el('div', 'toggle', row), 'on', r.toggle);
      else {
        var v = el('span', 'value', row);
        if (r.value === '›') v.textContent = '›';
        else { el('span', 'chev', v, '‹'); v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
      }
      hover(row, Z.SETTINGS, i);
    }
    el('div', 'hint', box, tr('OK ou as setas mudam o valor.', 'OK or the arrows change the value.', 'OK o las flechas cambian el valor.'));
    updateFocus();
  }

  function openSettings() {
    st.zone = Z.SETTINGS;
    st.row = 0;
    renderSettings();
    setClass($('settings'), 'open', true);
    updateFocus();
  }

  // MARK: - Shelf editor: which apps, in what order

  function ordinal(n) {
    if (I18N.lang === 'ru') return n + '-е';
    if (I18N.lang === 'de') return n + '.';
    if (I18N.lang !== 'en') return n + 'º';
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function editList() {
    var ids = shelf.map(function (a) { return a.id; });
    return {ids: ids, rows: apps.slice().sort(function (a, b) {
      var ia = ids.indexOf(a.id), ib = ids.indexOf(b.id);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1;
    })};
  }

  function renderShelfEdit() {
    var box = $('shelfedit').firstChild, e = editList();
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('apps', title);
    title.appendChild(document.createTextNode(tr('Prateleira', 'Shelf', 'Estante')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(e.rows.length, 7) * 78 + 'px';
    for (var i = 0; i < e.rows.length; i++) {
      var a = e.rows[i], at = e.ids.indexOf(a.id), row = el('div', 'row', holder, a.title);
      el('span', 'value', row, at >= 0 ? tr('Na prateleira · ', 'On · ', 'En el estante · ') + ordinal(at + 1) : tr('Fora', 'Off', 'Fuera'));
      hover(row, Z.EDIT, i);
    }
    el('div', 'hint', box, tr('OK põe ou tira · ← → mudam a ordem', 'OK adds or removes · ← → change the order', 'OK pone o quita · ← → cambian el orden'));
    updateFocus();
  }

  function openShelfEdit() {
    setClass($('settings'), 'open', false);
    st.zone = Z.EDIT;
    st.edit = 0;
    renderShelfEdit();
    setClass($('shelfedit'), 'open', true);
    updateFocus();
  }

  function editShelf(dx) {
    var e = editList(), app = e.rows[st.edit];
    if (!app) return;
    var ids = e.ids.slice(), at = ids.indexOf(app.id);
    if (dx === 0) {
      if (at >= 0) ids.splice(at, 1);
      else if (ids.length < MAX_SHELF) ids.push(app.id);
      else { toast(tr('A prateleira cabe até ' + MAX_SHELF + ' apps.', 'The shelf holds up to ' + MAX_SHELF + ' apps.', 'El estante tiene hasta ' + MAX_SHELF + ' apps.')); return; }
    } else {
      if (at < 0) return;
      var to = Math.max(0, Math.min(ids.length - 1, at + dx));
      ids.splice(at, 1);
      ids.splice(to, 0, app.id);
    }
    Prefs.set('shelf', ids);
    pickShelf();
    renderShelf();
    var again = editList();
    for (var i = 0; i < again.rows.length; i++) if (again.rows[i].id === app.id) st.edit = i;
    renderShelfEdit();
  }

  // MARK: - Opening things

  function launcher(id, name, pick) {
    return function () {
      function finished(ok, targeted) {
        if (!ok) toast(tr('Não deu para abrir ', "Couldn't open ", 'No se pudo abrir ') + (name || id));
        else if (pick && (!pick.url || targeted === false)) toast(tr('Procure por “' + pick.title + '” em ' + name + '.',
            'Search for “' + pick.title + '” in ' + name + '.', 'Busca “' + pick.title + '” en ' + name + '.'));
      }
      if (pick) TV.launchPick(id, pick, finished);
      else TV.launch(id, null, finished);
    };
  }

  function tvSettings() {
    TV.settings(function (ok) {
      if (!ok) toast(tr('Não deu para abrir os Ajustes da TV', "Couldn't open TV Settings", 'No se pudieron abrir los Ajustes del TV'));
    });
  }

  // function liveTV() {
  //   for (var index = 0; index < inputs.length; index++) if (inputs[index].key === 'live') return inputs[index];
  //   return null;
  // }

  function activate() {
    switch (st.zone) {
      case Z.TOP:
        if (st.top < TAB_KIND.length) return;
        openSettings();
        return;
      case Z.CARDS:
        var p = cards[st.card], app = p && Data.appFor(p.app);
        if (app) launcher(app.id, app.title, p)();
        else if (p && TAB_KIND[st.tab] === 'unavailable') openDetails(p);
        return;
      case Z.SHELF:
        if (shelf[st.shelf]) launcher(shelf[st.shelf].id, shelf[st.shelf].title)();
        return;
      case Z.DRAWER:
        var item = browsePicks[st.drawer], service = item && Data.appFor(item.app);
        if (service) launcher(service.id, service.title, item)();
        else if (item && TAB_KIND[st.tab] === 'unavailable') openDetails(item);
        return;
      case Z.APPS:
        if (others[st.grid]) launcher(others[st.grid].id, others[st.grid].title)();
        return;
      case Z.SETTINGS:
        if (rowsNow[st.row]) { rowsNow[st.row].step(1); if (st.zone === Z.SETTINGS) renderSettings(); }
        return;
      case Z.EDIT:
        editShelf(0);
        return;
      case Z.DETAILS:
        if (detailPick && detailPick.trailer && Data.appFor('youtube')) playTrailer();
        return;
    }
  }

  function selectTab(i) {
    if (i === st.tab) return;
    browsePositions[st.tab] = {index: st.drawer, first: st.first};
    st.tab = i;
    Prefs.set('tab', i);
    st.drawer = browsePositions[i].index;
    st.first = browsePositions[i].first;
    renderWatchlistStatus();
    renderCards();
    renderDrawer();
  }

  var detailReturn = Z.CARDS, detailRequest = 0, detailPick = null;
  function playTrailer() {
    var app = Data.appFor('youtube');
    if (!app || !detailPick || !detailPick.trailer) return;
    TV.playTrailer(app.id, detailPick.trailer, function (ok) {
      if (!ok) toast(tr('Não foi possível abrir o trailer.', "Couldn't open trailer.", 'No se pudo abrir el tráiler.'));
    });
  }

  function renderDetails(pick, loading) {
    var page = $('details');
    var previous = $('detail-content'), scroll = previous ? previous.scrollTop : 0;
    page.innerHTML = '';
    detailPick = pick;
    var poster = el('div', 'detail-poster', page);
    el('div', 'detail-poster-fallback', poster, pick.title);
    if (pick.poster) {
      var image = el('img', '', poster);
      image.alt = pick.title;
      image.onerror = function () { image.style.display = 'none'; };
      image.src = Data.image(pick.poster, 'w500');
    }
    if (pick.trailer && Data.appFor('youtube')) {
      var trailer = el('button', 'detail-trailer focus', page, '▶ ' + tr('Ver trailer', 'Watch trailer', 'Ver tráiler'));
      trailer.onclick = function () { poke(); playTrailer(); };
    }
    var content = el('div', 'detail-content', page);
    content.id = 'detail-content';
    el('div', 'detail-badge', content, pick.kind === 'tv' ? tr('Série', 'TV show', 'Serie') : tr('Filme', 'Movie', 'Película'));
    var title = el('h2', 'detail-title', content, pick.title);
    title.id = 'detail-title';
    el('div', 'detail-meta', content, pick.meta || '');
    var genres = el('div', 'detail-genres', content);
    (pick.genres || []).forEach(function (genre) { el('span', '', genres, genre); });
    if (pick.rating > 0) el('div', 'detail-rating', content, '★ ' + pick.rating.toFixed(1) + ' / 10 · TMDB');
    el('p', 'detail-overview', content, pick.overview || (loading
      ? tr('Carregando detalhes…', 'Loading details…', 'Cargando detalles…')
      : tr('Sinopse indisponível.', 'No synopsis available.', 'Sinopsis no disponible.')));
    if (pick.note) {
      var note = el('div', 'detail-note', content);
      el('div', 'detail-note-label', note, tr('Sua nota', 'Your note', 'Tu nota'));
      el('div', '', note, pick.note);
    }
    content.scrollTop = scroll;
  }

  function openDetails(pick) {
    detailReturn = st.zone;
    var request = ++detailRequest;
    st.zone = Z.DETAILS;
    $('details').innerHTML = '';
    renderDetails(pick, !pick.detailsLoaded);
    setClass($('details'), 'open', true);
    updateFocus();
    Data.details(pick, function (error, detail) {
      if (st.zone === Z.DETAILS && request === detailRequest) renderDetails(detail || pick, false);
    });
  }

  function closeDetails() {
    detailRequest++;
    setClass($('details'), 'open', false);
    st.zone = detailReturn;
    updateFocus();
  }

  function move(dx, dy) {
    var tiles = $('tiles').children, cardNodes = $('cards').children;
    switch (st.zone) {
      case Z.DETAILS:
        $('detail-content').scrollTop += dy * 160;
        return;
      case Z.SHELF:
        if (dx) st.shelf = Math.max(0, Math.min(shelf.length - 1, st.shelf + dx));
        else if (dy > 0) { openDrawer(); return; }
        else if (dy < 0) {
          if (st.browsing) st.browsing = false;
          if (cards.length) { st.zone = Z.CARDS; st.card = nearest(cardNodes, centerX(tiles[st.shelf])); }
          else { st.zone = Z.TOP; st.top = st.tab; }
        }
        break;
      case Z.CARDS:
        if (dx) st.card = Math.max(0, Math.min(cards.length - 1, st.card + dx));
        else if (dy < 0) { st.zone = Z.TOP; st.top = st.tab; }
        else if (shelf.length) { st.zone = Z.SHELF; st.shelf = nearest(tiles, centerX(cardNodes[st.card])); }
        break;
      case Z.TOP:
        if (dx) {
          st.top = Math.max(0, Math.min(TAB_KIND.length, st.top + dx));
          if (st.top < TAB_KIND.length) selectTab(st.top);   // as on Apple TV: focusing a tab selects it
        } else if (dy > 0) {
          if (cards.length) { st.zone = Z.CARDS; st.card = Math.min(cards.length - 1, st.top < TAB_KIND.length ? 0 : cards.length - 1); }
          else st.zone = Z.SHELF;
        }
        break;
      case Z.DRAWER:
        var target = st.drawer + dx + dy * BROWSE_COLUMNS;
        if (dy < 0 && st.drawer < BROWSE_COLUMNS) { st.zone = Z.SHELF; }
        else if (dy > 0 && Math.floor(target / BROWSE_COLUMNS) < Math.ceil(browsePicks.length / BROWSE_COLUMNS)) {
          st.drawer = Math.min(browsePicks.length - 1, target);
        } else if (dx && target >= 0 && target < browsePicks.length
            && Math.floor(target / BROWSE_COLUMNS) === Math.floor(st.drawer / BROWSE_COLUMNS)) st.drawer = target;
        else if (dy < 0 && target >= 0) st.drawer = target;
        break;
      case Z.APPS:
        var g = st.grid + dx + dy * 5;
        if (g >= 0 && g < others.length && (dx === 0 || Math.floor(g / 5) === Math.floor(st.grid / 5))) st.grid = g;
        break;
      case Z.SETTINGS:
        if (dy) st.row = Math.max(0, Math.min(rowsNow.length - 1, st.row + dy));
        else if (dx && rowsNow[st.row]) {
          var r = rowsNow[st.row];
          if (r.value !== '›') { r.step(dx); renderSettings(); }
        }
        break;
      case Z.EDIT:
        if (dy) st.edit = Math.max(0, Math.min(apps.length - 1, st.edit + dy));
        else if (dx) editShelf(dx);
        break;
    }
    updateFocus();
  }

  function back() {
    if (st.zone === Z.DETAILS) { closeDetails(); return; }
    if (st.zone === Z.EDIT) { setClass($('shelfedit'), 'open', false); openSettings(); st.row = rowsNow.length - 2; updateFocus(); return; }
    if (sheetOpen()) { closeSheets(); return; }
    if (st.browsing) { closeDrawer(); return; }
    if (st.zone !== Z.SHELF && shelf.length) { st.zone = Z.SHELF; updateFocus(); return; }
    TV.back();
  }

  /** The pointer focuses what it's over (the Magic Remote, or a mouse when previewing). */
  function hover(node, zone, index) {
    node.onmouseover = function (event) {
      if (event && event.relatedTarget && node.contains(event.relatedTarget)) return;
      if (saverOn || (sheetOpen() !== (zone === Z.APPS || zone === Z.SETTINGS || zone === Z.EDIT))) return;
      if (zone === Z.DRAWER && !st.browsing) return;
      if (zone !== Z.DRAWER && st.browsing && zone !== Z.SHELF) return;
      st.zone = zone;
      if (zone === Z.TOP) { st.top = index; if (index < TAB_KIND.length) selectTab(index); }
      else if (zone === Z.CARDS) st.card = index;
      else if (zone === Z.SHELF) st.shelf = index;
      else if (zone === Z.DRAWER) st.drawer = index;
      else if (zone === Z.APPS) st.grid = index;
      else if (zone === Z.SETTINGS) st.row = index;
      else if (zone === Z.EDIT) st.edit = index;
      updateFocus();
    };
    node.onclick = function () { node.onmouseover(); activate(); };
  }

  // MARK: - Toast

  var toastTimer = 0;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    setClass(t, 'on', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { setClass(t, 'on', false); }, 6000);
  }

  // MARK: - Night, clock, screensaver

  function checkNight() {
    setClass(body, 'night', Data.isNight(Date.now()));
  }

  var saverOn = false, idleAt = Date.now(), saverIndex = 0, saverTimer = 0, SAVER_AFTER = 5 * 60000;

  function showSaver() {
    if (saverOn) return;
    var photos = Data.showcase().filter(function (p) { return p.backdrop && Data.appFor(p.app); });
    saverOn = true;
    var s = $('saver');
    s.innerHTML = '';
    var a = el('div', 'photo', s), b = el('div', 'photo', s);
    el('div', 'shade', s);
    var clock = el('div', 'clock', s);
    el('div', 'time', clock);
    el('div', 'date', clock);
    var title = el('div', 'title', clock);
    var meta = el('div', 'meta', clock);
    var front = a;
    function next() {
      if (!saverOn) return;
      var p = photos.length ? photos[saverIndex++ % photos.length] : null;
      var back = front === a ? b : a;
      if (p) {
        back.style.backgroundImage = 'url(' + Data.image(p.backdrop, 'w1280') + ')';
        back.style.webkitTransform = back.style.transform = 'scale(1.0)';
        title.textContent = p.title;
        meta.textContent = p.meta || '';
        setTimeout(function () {
          setClass(back, 'on', true);
          setClass(front, 'on', false);
          back.style.webkitTransform = back.style.transform = 'scale(1.08) translateX(-1.5%)';
          front = back;
        }, 60);
      }
      tickSaverClock(clock);
      saverTimer = setTimeout(next, 12000);
    }
    setClass(s, 'on', true);
    next();
  }

  function tickSaverClock(clock) {
    var d = new Date();
    clock.firstChild.textContent = Data.time(d.getTime()).replace(/ (AM|PM)$/, '');
    try {
      clock.children[1].textContent = d.toLocaleDateString(I18N.locale(), {weekday: 'long', day: 'numeric', month: 'long'});
    } catch (e) {
      clock.children[1].textContent = d.toDateString();
    }
  }

  function hideSaver() {
    saverOn = false;
    clearTimeout(saverTimer);
    setClass($('saver'), 'on', false);
  }

  function poke() {
    idleAt = Date.now();
    if (saverOn) { hideSaver(); return true; }
    return false;
  }

  // MARK: - Keys

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (e.repeat && k === TV.keys.slideshow) { e.preventDefault(); return; }
    if (poke()) { e.preventDefault(); return; }   // the first press only wakes the screen
    if (k === TV.keys.slideshow) showSaver();
    else if (k === TV.keys.left) move(-1, 0);
    else if (k === TV.keys.right) move(1, 0);
    else if (k === TV.keys.up) move(0, -1);
    else if (k === TV.keys.down) move(0, 1);
    else if ((k === 33 || k === 34) && st.zone === Z.DETAILS) $('detail-content').scrollTop += k === 34 ? 560 : -560;
    else if ((k === 33 || k === 34) && st.browsing) {
      st.zone = Z.DRAWER;
      st.drawer = Math.max(0, Math.min(browsePicks.length - 1, st.drawer + (k === 34 ? 1 : -1) * BROWSE_COLUMNS * BROWSE_ROWS));
      updateFocus();
    }
    else if (k === TV.keys.ok) activate();
    else if (k === TV.keys.back || k === 27 || k === 8) back();
    else return;
    e.preventDefault();
  });
  document.addEventListener('mousemove', function () { poke(); });
  var wheelAt = 0;
  document.addEventListener('wheel', function (event) {
    if (sheetOpen() || !event.deltaY) return;
    event.preventDefault();
    if (poke() || Date.now() - wheelAt < 160) return;
    wheelAt = Date.now();
    if (!st.browsing && event.deltaY > 0) { openDrawer(); return; }
    if (!st.browsing) return;
    if (st.zone === Z.SHELF && event.deltaY < 0) { closeDrawer(); return; }
    st.zone = Z.DRAWER;
    move(0, event.deltaY > 0 ? 1 : -1);
  }, {passive: false});

  // MARK: - Start

  function renderAll() {
    renderTop();
    renderWatchlistStatus();
    renderCards();
    renderShelf();
    renderDrawer();
    renderPanels();
    renderClock();
    checkNight();
    if (st.zone === Z.SETTINGS) renderSettings();
    updateFocus();
  }

  var appsAt = 0;
  function loadApps(done) {
    if (apps.length && Date.now() - appsAt < 10 * 60000) { if (done) done(false); return; }
    TV.apps(function (list) {
      appsAt = Date.now();
      var changed = JSON.stringify(apps) !== JSON.stringify(list);
      if (changed) {
        apps = list;
        Data.setApps(apps);
        pickShelf();
      }
      // TV.inputs(function (list2) { inputs = list2; });
      if (done) done(changed);
    });
  }

  /** Back to the home screen (the app was opened again): the shelf, everything closed, the first tab. */
  function reset() {
    hideSaver();
    closeSheets();
    st.zone = Z.SHELF;
    st.browsing = false;
    st.shelf = 0;
    st.drawer = 0;
    st.first = 0;
    browsePicks = [];
    browsePositions = TAB_KIND.map(function () { return {index: 0, first: 0}; });
    updateFocus();
  }

  Data.onChange(function (kind) {
    if (document.hidden) return;
    if (kind !== 'weather') renderWatchlistStatus();
    if (kind === 'watchlist' || kind === 'settings') {
      renderCards();
      renderDrawer();
    }
    if (kind === 'weather' || kind === 'settings') renderPanels();
    if (st.zone === Z.SETTINGS) renderSettings();
    var status = Data.watchlistStatus();
    if (manualRefresh && !status.refreshing) {
      manualRefresh = false;
      toast(status.error || tr('Lista atualizada.', 'Watchlist updated.', 'Lista actualizada.'));
    }
    checkNight();
  });

  function reopened() {
    if (window.PalmSystem && window.PalmSystem.activate) window.PalmSystem.activate();
    if (wasHidden) {
      wasHidden = false;
      Data.startSession();
    }
    reset();
    loadApps(function () { renderAll(); Data.refresh(); });
  }

  window.addEventListener('resize', fit);
  document.addEventListener('webOSRelaunch', reopened);   // LG: opened again while running
  window.addEventListener('appcontrol', reopened);        // Samsung: the same
  var wasHidden = document.hidden;
  document.addEventListener('visibilitychange', function () {
    Data.setActive(!document.hidden);
    if (document.hidden) { wasHidden = true; hideSaver(); return; }
    if (!wasHidden) { Data.refresh(); return; }
    idleAt = Date.now();
    reopened();
  });

  I18N.set(Prefs.language());
  fit();
  renderTop();
  apps = TV.cachedApps();
  if (apps.length) {
    Data.setApps(apps);
    pickShelf();
    renderAll();
    setTimeout(function () {
      loadApps(function (changed) { if (changed) renderAll(); });
      Data.refresh();
    }, 1500);
  } else loadApps(function () {
    renderAll();
    setTimeout(function () { Data.refresh(); }, 1500);
  });
  setInterval(function () {
    if (document.hidden) return;
    renderClock();
    checkNight();
    Data.refresh();
    if (!saverOn && !sheetOpen() && Date.now() - idleAt > SAVER_AFTER) showSaver();
    if (saverOn) tickSaverClock($('saver').querySelector('.clock'));
  }, 30000);

  // For the browser preview and tests.
  window.FreeMyTV = {state: st, move: move, activate: activate, back: back, showSaver: showSaver, hideSaver: hideSaver, toast: toast};
})();
