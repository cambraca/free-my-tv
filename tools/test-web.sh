#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node tests/WebPrefsTest.js
node tests/WatchlistAccountsTest.js
node tests/TorrentSearchViewTest.js

node tests/RemoteReceiverTest.js
node tests/PlexRemoteTargetTest.js
node tests/PreviewDetailsTest.js
node tests/TitleRatingsTest.js
node tests/PhoneDetailsTest.js
node tests/PreviewModeTest.js
node tests/PhoneTorrentsTest.js
