/* Optional receiver. No UI, startup dependency, or persistent command queue. ES5 for old TVs. */
(function () {
  'use strict';
  if (TV.name !== 'webos' || !CONFIG.remoteUrl || !CONFIG.remoteToken) return;
  var active = null, timer = null;
  function post(endpoint, payload, done) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', CONFIG.remoteUrl + '/api/remote/' + endpoint, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', 'Bearer ' + CONFIG.remoteToken);
    xhr.timeout = 25000;
    xhr.onload = function () {
      var value = null;
      try { if (xhr.status === 200) value = JSON.parse(xhr.responseText); } catch (e) {}
      done(value);
    };
    xhr.onerror = xhr.ontimeout = function () { done(null); };
    xhr.send(JSON.stringify(payload));
    return xhr;
  }
  function poll() {
    if (document.hidden) return;
    active = post('poll', {}, function (command) {
      active = null;
      if (command && command.id) {
        if (command.action === 'launch') {
          if (command.pick.app === 'plex') {
            // The computer owns Plex follow-through and its result.
            TV.launch(command.appId, null, function (ok) {
              if (!ok) post('result', {id: command.id, error: 'TV could not launch Plex.'}, function () {});
            });
          } else TV.launchPick(command.appId, command.pick, function (ok) {
            post('result', {id: command.id, error: ok ? '' : 'TV could not launch the app.'}, function () {});
          });
        }
      }
      timer = setTimeout(poll, command ? 250 : 30000);
    });
  }
  document.addEventListener('visibilitychange', function () {
    clearTimeout(timer);
    if (active) { active.abort(); active = null; }
    if (!document.hidden) timer = setTimeout(poll, 1000);
  });
  timer = setTimeout(poll, 3000);
}());
