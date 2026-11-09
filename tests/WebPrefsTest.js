/*
 * Fork web preferences: retained tabs and removed input/crypto APIs. Run by tools/test-web.sh.
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');

function prefs(stored) {
  var sandbox = {
    window: {},
    navigator: {language: 'en-US'},
    localStorage: {
      getItem: function () { return stored === undefined ? null : JSON.stringify(stored); },
      setItem: function () {}
    },
    I18N: {},
    TV: {zone: function () { return ''; }},
    XMLHttpRequest: function () {}
  };
  var code = fs.readFileSync(path.join(__dirname, '..', 'web', 'data.js'), 'utf8');
  vm.runInNewContext(code.slice(0, code.indexOf('var Data =')), sandbox, {filename: 'web/data.js'});
  return sandbox.Prefs;
}

var failures = 0;
function expect(actual, want, label) {
  if (actual === want) return;
  failures++;
  console.error('FAIL ' + label + ': got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(want));
}

expect(prefs({}).tab(), 0, 'default tab');
expect(prefs({tab: 4}).tab(), 4, 'Watched tab persists');
expect(prefs({tab: 99}).tab(), 4, 'tab upper bound');
expect(prefs({tab: -1}).tab(), 0, 'tab lower bound');
expect(prefs({tab: 'invalid'}).tab(), 0, 'invalid tab');
expect(typeof prefs({boxInput: 'hdmi2'}).boxInput, 'undefined', 'no input preference API');
expect(typeof prefs({quotes: true}).quotes, 'undefined', 'old crypto preference cannot enable quotes');

if (failures) process.exit(1);
console.log('WebPrefsTest: all checks passed.');
