const fs = require('fs');
const path = require('path');

// File storage adapter. The default writes to a private folder on disk; swap in S3 or similar by returning { put, get }.
function localDisk(dir) {
  const root = path.resolve(dir);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const safe = (key) => { const p = path.resolve(root, key); if (!p.startsWith(root + path.sep)) throw new Error('bad storage key'); return p; };
  return {
    put(key, buf) { const p = safe(key); fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 }); fs.writeFileSync(p, buf, { mode: 0o600 }); },
    get(key) { return fs.readFileSync(safe(key)); },
  };
}
module.exports = { localDisk };
