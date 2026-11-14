'use strict';

// This selects a preview layout only. Installed apps retain their native platform detection.
module.exports = function previewMode(url, userAgent = '') {
  const query = new URL(url, 'http://localhost').searchParams;
  const forced = query.get('mode');
  if (forced === 'tv' || forced === 'remote') return forced;
  // Preserve bookmarks created before the mode parameter was introduced.
  if (query.get('remote') === '1') return 'remote';
  if (query.get('remote') === '0') return 'tv';
  // Test TV markers first: many TV agents also claim Android, Linux, or Macintosh.
  if (/web[o0]s|netcast|smart[- ]?tv|tizen|hbbtv|googletv|google tv|android tv|\bAFT[A-Z0-9]+|bravia|viera|appletv|crkey|roku/i.test(userAgent)) return 'tv';
  if (/iPhone|iPad|iPod|Android.*(?:Mobile|Tablet)|Windows NT|Macintosh|X11|CrOS/i.test(userAgent)) return 'remote';
  return 'tv';
};
