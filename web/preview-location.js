/* Browser preview URL state shared by the responsive and TV layouts. */
var PreviewLocation = (function () {
  'use strict';

  var accountId = /^(?:ur\d+|p\.[a-zA-Z0-9]+)$/;

  function read() {
    var hash = window.location.hash || '';
    var tab = /(?:^#|&)tab=(explore|movie|tv|unavailable|watched)(?:&|$)/.exec(hash);
    var title = /(?:^#|&)title=(tt\d+)(?:&|$)/.exec(hash);
    var account = /(?:^#|&)account=([^&]+)/.exec(hash);
    return {tab: tab ? (tab[1] === 'explore' ? 'all' : tab[1]) : '', title: title ? title[1] : '',
      account: account && accountId.test(account[1]) ? account[1] : ''};
  }

  function selectAccount(accounts, requested, saved) {
    var first = accounts.length ? accounts[0].id : '';
    if (accounts.some(function (account) { return account.id === requested; })) return requested;
    return accounts.some(function (account) { return account.id === saved; }) ? saved : first;
  }

  function write(tab, title, account) {
    var hash = '#tab=' + (tab === 'all' ? 'explore' : tab);
    if (/^tt\d+$/.test(title || '')) hash += '&title=' + title;
    if (accountId.test(account || '')) hash += '&account=' + account;
    if (window.location.hash !== hash) window.history.replaceState(window.history.state, '', hash);
  }

  return {read: read, selectAccount: selectAccount, write: write};
})();
