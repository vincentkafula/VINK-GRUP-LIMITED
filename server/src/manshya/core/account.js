const { ApiError, rid, now, sha256, num, text, oneOf } = require('./util');

const DEFAULT_SETTINGS = {
  payment_methods: { card: true, eft: true, qr: true },
  notifications: { payment_paid: true, payment_failed: true, payout: true, transfer: true, email: true },
  display: { theme: 'system' },
  home: { show_quick_actions: true, show_activity: true, show_accounts: true },
  billing: { invoice_email: '', vat_number: '' },
};
const PROFILE_FIELDS = {
  business: ['legal_name', 'trading_name', 'registration_number', 'vat_number', 'industry', 'address', 'phone', 'website'],
  personal: ['name', 'email', 'phone', 'id_number'],
};
const ROLES = ['viewer', 'finance', 'admin', 'owner'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = function buildAccount({ db, core, config, storage }) {
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const notFound = (w) => new ApiError(404, `${w}_not_found`, `${w} not found`);

  /* settings (payment methods, notifications, display, billing) */
  const getSettings = (m) => {
    const saved = JSON.parse(get('SELECT settings FROM merchants WHERE id=?', m.id).settings || '{}');
    const out = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = { ...DEFAULT_SETTINGS[k], ...(saved[k] || {}) };
    return out;
  };
  function updateSettings(m, patch = {}) {
    const cur = getSettings(m);
    for (const [sec, vals] of Object.entries(patch)) {
      if (!DEFAULT_SETTINGS[sec] || typeof vals !== 'object' || !vals) throw new ApiError(400, 'invalid_settings', `Unknown settings section: ${sec}`);
      for (const [k, v] of Object.entries(vals)) {
        if (!(k in DEFAULT_SETTINGS[sec]) || typeof v !== typeof DEFAULT_SETTINGS[sec][k]) throw new ApiError(400, 'invalid_settings', `Invalid setting: ${sec}.${k}`);
        if (typeof v === 'string' && v.length > 120) throw new ApiError(400, 'invalid_settings', `${sec}.${k} is too long`);
        if (sec === 'display' && k === 'theme') oneOf(v, 'theme', ['system', 'light', 'dark']);
        if (sec === 'billing' && k === 'invoice_email' && v && !EMAIL.test(v)) throw new ApiError(400, 'invalid_settings', 'invoice_email is not a valid email');
        cur[sec][k] = v;
      }
    }
    if (!Object.values(cur.payment_methods).some(Boolean)) throw new ApiError(400, 'invalid_settings', 'Keep at least one payment method turned on');
    run('UPDATE merchants SET settings=? WHERE id=?', JSON.stringify(cur), m.id);
    return cur;
  }

  /* profile: business and personal information */
  const getProfile = (m) => {
    const saved = JSON.parse(get('SELECT profile FROM merchants WHERE id=?', m.id).profile || '{}');
    const out = {};
    for (const [sec, fields] of Object.entries(PROFILE_FIELDS)) { out[sec] = {}; for (const f of fields) out[sec][f] = (saved[sec] || {})[f] || ''; }
    return out;
  };
  function updateProfile(m, patch = {}) {
    const cur = getProfile(m);
    for (const [sec, vals] of Object.entries(patch)) {
      if (!PROFILE_FIELDS[sec] || typeof vals !== 'object' || !vals) throw new ApiError(400, 'invalid_profile', `Unknown section: ${sec}`);
      for (const [k, v] of Object.entries(vals)) {
        if (!PROFILE_FIELDS[sec].includes(k)) throw new ApiError(400, 'invalid_profile', `Unknown field: ${sec}.${k}`);
        const t = text(v, k, { optional: true, max: 160 }) || '';
        if (k === 'id_number' && t && !/^\d{13}$/.test(t)) throw new ApiError(400, 'invalid_id_number', 'id_number must be 13 digits');
        if (k === 'vat_number' && t && !/^\d{10}$/.test(t)) throw new ApiError(400, 'invalid_vat_number', 'vat_number must be 10 digits');
        if (k === 'email' && t && !EMAIL.test(t)) throw new ApiError(400, 'invalid_email', 'email is not valid');
        cur[sec][k] = t;
      }
    }
    run('UPDATE merchants SET profile=? WHERE id=?', JSON.stringify(cur), m.id);
    return cur;
  }

  /* ultimate beneficial owners */
  const publicUbo = (u) => ({ id: u.id, name: u.name, id_number: u.id_number, ownership_pct: u.ownership_pct, nationality: u.nationality });
  function createUbo(m, b = {}) {
    const id_number = text(b.idNumber, 'idNumber', { optional: true, max: 13 });
    if (id_number && !/^\d{13}$/.test(id_number)) throw new ApiError(400, 'invalid_idNumber', 'idNumber must be 13 digits');
    const pct = num(b.ownershipPct, 'ownershipPct', { min: 1, max: 100 });
    const used = get('SELECT COALESCE(SUM(ownership_pct),0) s FROM ubos WHERE merchant_id=?', m.id).s;
    if (used + pct > 100) throw new ApiError(409, 'ownership_exceeds_100', 'Total ownership cannot be more than 100%');
    const id = rid('ubo');
    run('INSERT INTO ubos(id,merchant_id,name,id_number,ownership_pct,nationality,created_at) VALUES(?,?,?,?,?,?,?)',
      id, m.id, text(b.name, 'name', { max: 100 }), id_number, pct, text(b.nationality, 'nationality', { optional: true, max: 60 }), now());
    return publicUbo(get('SELECT * FROM ubos WHERE id=?', id));
  }
  const listUbos = (m) => ({ data: all('SELECT * FROM ubos WHERE merchant_id=? ORDER BY created_at', m.id).map(publicUbo) });
  const deleteUbo = (m, id) => { if (!run('DELETE FROM ubos WHERE id=? AND merchant_id=?', id, m.id).changes) throw notFound('ubo'); return { ok: true }; };

  /* verification documents: metadata only. Store the files in object storage and keep the key in `filename`. */
  const DOC_TYPES = ['id_document', 'proof_of_address', 'company_registration', 'bank_letter', 'tax_clearance'];
  function addDocument(m, b = {}) {
    const id = rid('doc');
    run('INSERT INTO documents(id,merchant_id,type,filename,created_at) VALUES(?,?,?,?,?)', id, m.id, oneOf(b.type, 'type', DOC_TYPES), text(b.filename, 'filename', { max: 120 }), now());
    return get('SELECT id,type,filename,status,note,created_at FROM documents WHERE id=?', id);
  }
  const sniff = (b) => (b.subarray(0, 4).toString('latin1') === '%PDF' ? 'application/pdf' : b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG' ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg' : null);
  // Uploads: PDF, PNG or JPEG up to 2 MB, recognised by their first bytes (the file name and declared type are never trusted).
  function addDocumentFile(m, b = {}) {
    const type = oneOf(b.type, 'type', DOC_TYPES);
    if (typeof b.contentBase64 !== 'string' || b.contentBase64.length > 3000000) throw new ApiError(400, 'invalid_file', 'Attach a file up to 2 MB');
    const buf = Buffer.from(b.contentBase64, 'base64');
    if (!buf.length || buf.length > 2 * 1024 * 1024) throw new ApiError(400, 'invalid_file', 'Attach a file up to 2 MB');
    if (!sniff(buf)) throw new ApiError(400, 'invalid_file', 'Only PDF, PNG or JPEG files are accepted');
    const filename = String(b.filename || 'document').replace(/^.*[\\/]/, '').replace(/[^\w.\- ]/g, '_').slice(0, 100) || 'document';
    const id = rid('doc'), key = `docs/${m.id}/${id}`;
    storage.put(key, buf);
    run('INSERT INTO documents(id,merchant_id,type,filename,storage_key,created_at) VALUES(?,?,?,?,?,?)', id, m.id, type, filename, key, now());
    return get('SELECT id,type,filename,status,note,created_at FROM documents WHERE id=?', id);
  }
  function documentFile(id) {
    const d = get('SELECT * FROM documents WHERE id=?', id);
    if (!d || !d.storage_key) throw notFound('document');
    const buffer = storage.get(d.storage_key);
    return { buffer, filename: d.filename, contentType: sniff(buffer) || 'application/octet-stream' };
  }
  const listDocuments = (m) => ({ data: all('SELECT id,type,filename,status,note,created_at FROM documents WHERE merchant_id=? ORDER BY created_at DESC', m.id) });
  // Back office only (no merchant route). Approving every required type marks the merchant verified.
  function reviewDocument(id, status, note) {
    oneOf(status, 'status', ['approved', 'rejected']);
    const d = get('SELECT * FROM documents WHERE id=?', id);
    if (!d) throw notFound('document');
    run('UPDATE documents SET status=?,note=? WHERE id=?', status, note || null, id);
    const ok = ['id_document', 'proof_of_address', 'company_registration', 'bank_letter'].every((t) => get("SELECT 1 FROM documents WHERE merchant_id=? AND type=? AND status='approved'", d.merchant_id, t));
    if (ok) run('UPDATE merchants SET verified=1 WHERE id=?', d.merchant_id);
    return { id, status, verified: ok };
  }

  /* users and roles */
  function inviteUser(m, b = {}) {
    const email = text(b.email, 'email', { max: 120 }).toLowerCase();
    if (!EMAIL.test(email)) throw new ApiError(400, 'invalid_email', 'email is not valid');
    if (get('SELECT 1 FROM users WHERE merchant_id=? AND email=?', m.id, email)) throw new ApiError(409, 'user_exists', 'That person is already on your team');
    const id = rid('usr');
    run('INSERT INTO users(id,merchant_id,name,email,role,created_at) VALUES(?,?,?,?,?,?)', id, m.id, text(b.name, 'name', { max: 80 }), email, oneOf(b.role, 'role', ['admin', 'finance', 'viewer']), now());
    return get('SELECT id,name,email,role,status,created_at FROM users WHERE id=?', id);
  }
  const listUsers = (m) => ({ data: all('SELECT id,name,email,role,status,created_at FROM users WHERE merchant_id=? ORDER BY created_at', m.id) });
  function updateUser(m, id, b = {}) {
    const u = get('SELECT * FROM users WHERE id=? AND merchant_id=?', id, m.id);
    if (!u) throw notFound('user');
    run('UPDATE users SET role=?,status=? WHERE id=?', b.role === undefined ? u.role : oneOf(b.role, 'role', ['admin', 'finance', 'viewer']),
      b.status === undefined ? u.status : oneOf(b.status, 'status', ['invited', 'active', 'suspended']), id);
    return get('SELECT id,name,email,role,status,created_at FROM users WHERE id=?', id);
  }
  const removeUser = (m, id) => { if (!run('DELETE FROM users WHERE id=? AND merchant_id=?', id, m.id).changes) throw notFound('user'); return { ok: true }; };

  /* API keys */
  const listKeys = (m) => ({ data: all('SELECT hash,label,role,hint,revoked,created_at FROM api_keys WHERE merchant_id=? ORDER BY created_at DESC', m.id)
    .map((k) => ({ id: k.hash.slice(0, 12), label: k.label, role: k.role, hint: '…' + k.hint, revoked: !!k.revoked, created_at: k.created_at })) });
  function createKey(m, b = {}, actorRole = 'admin') {
    const role = oneOf(b.role || 'admin', 'role', ['viewer', 'finance', 'admin']);
    if (ROLES.indexOf(role) > ROLES.indexOf(actorRole)) throw new ApiError(403, 'forbidden', 'You cannot create a key with more access than your own');
    return { key: core.issueApiKey(m.id, text(b.label, 'label', { max: 60 }), role), role }; // shown once
  }
  function revokeKey(m, id) {
    if (!/^[a-f0-9]{12}$/.test(String(id))) throw notFound('key');
    if (!run('UPDATE api_keys SET revoked=1 WHERE merchant_id=? AND substr(hash,1,12)=?', m.id, id).changes) throw notFound('key');
    return { ok: true };
  }

  /* audit log and notifications */
  const listAudit = (m, q = {}) => ({ data: all('SELECT id,actor,action,status,created_at FROM audit_log WHERE merchant_id=? AND (? IS NULL OR id<?) ORDER BY id DESC LIMIT ?',
    m.id, q.before || null, q.before || null, Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200)) });
  const audit = (mid, actor, action, status) => run('INSERT INTO audit_log(merchant_id,actor,action,status,created_at) VALUES(?,?,?,?,?)', mid, actor, action, status, now());

  function notify(mid, type, title, body) {
    run('INSERT INTO notifications(id,merchant_id,type,title,body,created_at) VALUES(?,?,?,?,?,?)', rid('ntf'), mid, type, title, body || null, now());
  }
  const listNotifications = (m) => ({
    unread: get('SELECT COUNT(*) n FROM notifications WHERE merchant_id=? AND read=0', m.id).n,
    data: all('SELECT id,type,title,body,read,created_at FROM notifications WHERE merchant_id=? ORDER BY created_at DESC LIMIT 30', m.id),
  });
  const markRead = (m) => { run('UPDATE notifications SET read=1 WHERE merchant_id=?', m.id); return { ok: true }; };

  return {
    getSettings, updateSettings, getProfile, updateProfile, createUbo, listUbos, deleteUbo, addDocument, addDocumentFile, documentFile, listDocuments, reviewDocument,
    inviteUser, listUsers, updateUser, removeUser, listKeys, createKey, revokeKey, listAudit, audit, notify, listNotifications, markRead,
  };
};
module.exports.ROLES = ROLES;
