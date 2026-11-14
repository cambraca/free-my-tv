'use strict';
const assert = require('node:assert/strict');
const mode = require('../tools/preview-mode');
for (const agent of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit Chrome/130 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  'Mozilla/5.0 (X11; Linux x86_64)', 'Mozilla/5.0 (X11; CrOS x86_64)']) assert.equal(mode('/', agent), 'remote', agent);
for (const agent of ['', 'Unknown device', 'Mozilla/5.0', 'Mozilla/5.0 (Linux; Android 11)',
  'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit', 'Mozilla/5.0 (X11; Linux x86_64) webOS.TV',
  'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0)', 'Mozilla/5.0 (Linux; Android 9; AFTMM) Mobile',
  'Mozilla/5.0 (Linux; Android TV) Mobile']) assert.equal(mode('/', agent), 'tv', agent);
assert.equal(mode('/?mode=tv', 'iPhone'), 'tv');
assert.equal(mode('/?mode=remote', 'webOS'), 'remote');
assert.equal(mode('/?mode=tv&remote=1', 'iPhone'), 'tv');
assert.equal(mode('/index.html?mode=remote', ''), 'remote');
assert.equal(mode('/phone.html?mode=tv', 'Windows NT'), 'tv');
assert.equal(mode('/?mode=invalid', ''), 'tv');
assert.equal(mode('/?remote=1', ''), 'remote');
console.log('PreviewModeTest: phones, computers, TVs, unknown devices and explicit overrides passed.');
