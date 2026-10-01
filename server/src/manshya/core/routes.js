const express = require('express');
const crypto = require('crypto');
const { ApiError, rid, now, sha256, text } = require('./util');
const { ROLES } = require('./account');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function limiter(max, windowMs = 60000, keyFn) {
  const hits = new Map();
  setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (v.reset < t) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const k = keyFn(req), t = Date.now();
    let h = hits.get(k);
    if (!h || h.reset < t) { h = { n: 0, reset: t + windowMs }; hits.set(k, h); }
    if (++h.n > max) return next(new ApiError(429, 'rate_limited', 'Too many requests. Try again shortly.'));
    next();
  };
}

function privateHost(h) {
  return h === 'localhost' || h.endsWith('.local') || h === '::1' || h === '[::1]' ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
}
function validateWebhookUrl(raw, config) {
  let u;
  try { u = new URL(raw); } catch { throw new ApiError(400, 'invalid_url', 'url must be a valid URL'); }
  if (u.protocol !== 'https:' && !config.allowInsecureWebhooks) throw new ApiError(400, 'invalid_url', 'Webhook URLs must use https');
  if (!config.allowInsecureWebhooks && privateHost(u.hostname)) throw new ApiError(400, 'invalid_url', 'Webhook URLs must be publicly reachable');
  return u.toString();
}

module.exports = function buildRouter({ db, services: s, gateways, config, authenticate, routes2, routes3 }) {
  const r = express.Router();
  const ipKey = (req) => 'ip:' + req.ip;

  r.get('/health', (req, res) => res.json({ ok: true, mode: config.mode }));

  /* ----- public routes (no merchant auth) ----- */
  // Gateway webhooks need the RAW body to verify the signature. Mount this router before any global
  // express.json(), or make your global parser store req.rawBody (see README).
  r.post('/gateways/:name/webhook', limiter(300, 60000, ipKey), express.raw({ type: '*/*', limit: '100kb' }), wrap((req, res) => {
    const gw = gateways[req.params.name];
    if (!gw || typeof gw.verifyWebhook !== 'function') throw new ApiError(404, 'gateway_not_found', 'Unknown gateway');
    const raw = Buffer.isBuffer(req.body) ? req.body : req.rawBody;
    if (!Buffer.isBuffer(raw)) throw new ApiError(500, 'raw_body_missing', 'Raw request body unavailable; see README');
    let evt;
    try { evt = gw.verifyWebhook(raw, req.headers); } catch { throw new ApiError(401, 'bad_signature', 'Invalid signature'); }
    res.json({ received: true, matched: s.applyGatewayEvent(gw.name, evt) });
  }));

  routes3.mountRaw(r, { limiter, ipKey });

  // JSON bodies are capped at 100 KB, except document uploads (3 MB, and limited per IP before the body is read).
  const json100 = express.json({ limit: '100kb' }), json3m = express.json({ limit: '3mb' }), uploadLimit = limiter(20, 60000, ipKey);
  r.use((req, res, next) => (req.method === 'POST' && req.path === '/account/documents/upload' ? uploadLimit(req, res, () => json3m(req, res, next)) : json100(req, res, next)));
  r.get('/public/payment-requests/:token', limiter(60, 60000, ipKey), wrap((req, res) => res.json(s.getRequestByToken(req.params.token))));
  r.post('/public/payment-requests/:token/pay', limiter(20, 60000, ipKey), wrap(async (req, res) => res.json(await s.payRequest(req.params.token, req.body))));

  routes2.mountPublic(r, { wrap, limiter, ipKey });
  routes3.mountPublic(r, { limiter, ipKey });
  routes3.mountAdmin(r, { limiter, ipKey });

  /* ----- authenticated routes ----- */
  r.use(wrap(async (req, res, next) => {
    const p = await authenticate(req);
    const m = p && db.prepare('SELECT * FROM merchants WHERE id=?').get(p.merchantId);
    if (!m) throw new ApiError(401, 'unauthorized', 'Missing or invalid credentials');
    if (m.status === 'suspended') throw new ApiError(403, 'account_suspended', 'This account is suspended. Please contact support.');
    req.merchant = m;
    req.role = ROLES.includes(p.role) ? p.role : 'admin';
    req.actor = p.actor || 'merchant';
    next();
  }));
  r.use(limiter(300, 60000, (req) => 'm:' + req.merchant.id));

  // Roles: viewer is read-only; `need('admin')` guards settings, account, users and keys.
  const need = (role) => (req, res, next) => (ROLES.indexOf(req.role) >= ROLES.indexOf(role) ? next() : next(new ApiError(403, 'forbidden', `This needs the ${role} role`)));
  r.use((req, res, next) => (req.method !== 'GET' && req.role === 'viewer' ? next(new ApiError(403, 'forbidden', 'Your role is read-only')) : next()));
  // Audit trail: every write is recorded with who did it, what route, and the result (never the body).
  r.use((req, res, next) => {
    if (req.method !== 'GET') res.on('finish', () => {
      try { db.prepare('INSERT INTO audit_log(merchant_id,actor,action,status,created_at) VALUES(?,?,?,?,?)').run(req.merchant.id, req.actor, `${req.method} ${req.baseUrl}${req.path}`.slice(0, 160), res.statusCode, now()); } catch {}
    });
    next();
  });

  // Idempotency-Key support for every money-moving POST
  const idem = (req, res, next) => {
    const key = req.get('idempotency-key');
    if (!key) return next();
    if (key.length > 100) return next(new ApiError(400, 'invalid_idempotency_key', 'Idempotency-Key is too long'));
    const mid = req.merchant.id;
    const sig = `${req.method} ${req.baseUrl}${req.path} ${sha256(JSON.stringify(req.body || {}))}`;
    const row = db.prepare('SELECT * FROM idempotency WHERE key=? AND merchant_id=?').get(key, mid);
    if (row) {
      if (row.sig !== sig) return next(new ApiError(422, 'idempotency_mismatch', 'This Idempotency-Key was used with a different request'));
      if (row.response == null) return next(new ApiError(409, 'in_progress', 'A request with this Idempotency-Key is still processing'));
      return res.status(row.status_code).set('Idempotent-Replay', 'true').type('json').send(row.response);
    }
    try { db.prepare('INSERT INTO idempotency(key,merchant_id,sig,created_at) VALUES(?,?,?,?)').run(key, mid, sig, now()); }
    catch { return next(new ApiError(409, 'in_progress', 'A request with this Idempotency-Key is still processing')); }
    const send = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 500) db.prepare('UPDATE idempotency SET status_code=?,response=? WHERE key=? AND merchant_id=?').run(res.statusCode, JSON.stringify(body), key, mid);
      else db.prepare('DELETE FROM idempotency WHERE key=? AND merchant_id=?').run(key, mid);
      return send(body);
    };
    next();
  };

  const M = (req) => req.merchant;
  r.get('/me', (req, res) => { const m = M(req); res.json({ id: m.id, name: m.name, verified: !!m.verified, webhook_url: m.webhook_url, role: req.role }); });

  // dashboards
  r.get('/dashboard/online', wrap((req, res) => res.json(s.dashOnline(M(req), req.query.month))));
  r.get('/dashboard/pos', wrap((req, res) => res.json(s.dashPos(M(req)))));
  r.get('/dashboard/bank', wrap((req, res) => res.json(s.dashBank(M(req)))));

  // payments
  r.post('/payments', idem, wrap(async (req, res) => res.status(201).json(await s.createPayment(M(req), req.body))));
  r.get('/payments', wrap((req, res) => res.json(s.listPayments(M(req), req.query))));
  r.get('/payments/:id', wrap((req, res) => res.json(s.getPayment(M(req), req.params.id))));
  r.post('/payments/:id/refund', idem, wrap(async (req, res) => res.json(await s.refundPayment(M(req), req.params.id, req.body))));

  // payment requests
  r.post('/payment-requests', wrap((req, res) => res.status(201).json(s.createRequest(M(req), req.body))));
  r.get('/payment-requests', wrap((req, res) => res.json(s.listRequests(M(req)))));
  r.post('/payment-requests/:id/cancel', wrap((req, res) => res.json(s.cancelRequest(M(req), req.params.id))));

  // balance and payouts
  r.get('/balance', wrap((req, res) => res.json(s.balance(M(req)))));
  const rank = (req) => ROLES.indexOf(req.role), who = (req) => ({ rank: rank(req), actor: req.actor });
  r.post('/payouts', idem, wrap(async (req, res) => res.status(201).json(await s.requestPayout(M(req), req.body, who(req)))));
  r.post('/payouts/:id/approve', need('admin'), wrap(async (req, res) => res.json(await s.approvePayout(M(req), req.params.id, who(req)))));
  r.post('/payouts/:id/reject', need('admin'), wrap(async (req, res) => res.json(s.rejectPayout(M(req), req.params.id))));
  r.get('/payouts', wrap((req, res) => res.json(s.listPayouts(M(req)))));

  // point of sale
  r.post('/pos/devices', wrap((req, res) => res.status(201).json(s.createDevice(M(req), req.body))));
  r.get('/pos/devices', wrap((req, res) => res.json(s.listDevices(M(req)))));
  r.post('/pos/devices/:id/heartbeat', wrap((req, res) => res.json(s.heartbeat(M(req), req.params.id))));
  r.post('/pos/sales', idem, wrap(async (req, res) => res.status(201).json(await s.createPayment(M(req), { ...req.body, channel: 'pos' }))));

  // banking
  r.get('/bank/accounts', wrap((req, res) => res.json({ data: s.listAccounts(M(req)) })));
  r.post('/bank/accounts', wrap((req, res) => res.status(201).json(s.createBankAccount(M(req).id, req.body))));
  r.get('/bank/accounts/:id/statement', wrap((req, res) => res.json(s.statement(M(req), req.params.id, req.query))));
  r.get('/bank/beneficiaries', wrap((req, res) => res.json(s.listBeneficiaries(M(req)))));
  r.post('/bank/beneficiaries', wrap((req, res) => res.status(201).json(s.createBeneficiary(M(req), req.body))));
  r.post('/bank/transfers', idem, wrap(async (req, res) => res.status(201).json(await s.transfer(M(req), req.body))));
  r.get('/bank/transfers', wrap((req, res) => res.json(s.listTransfers(M(req)))));

  // outbound webhook configuration
  r.put('/webhook', wrap((req, res) => {
    const url = validateWebhookUrl(text(req.body.url, 'url', { max: 300 }), config);
    const secret = 'whsec_' + crypto.randomBytes(24).toString('base64url');
    db.prepare('UPDATE merchants SET webhook_url=?,webhook_secret=? WHERE id=?').run(url, secret, M(req).id);
    res.json({ url, secret }); // secret is shown once
  }));
  r.delete('/webhook', wrap((req, res) => {
    db.prepare('UPDATE merchants SET webhook_url=NULL,webhook_secret=NULL WHERE id=?').run(M(req).id);
    res.json({ ok: true });
  }));

  routes2.mountPrivate(r, { wrap, idem, need });
  routes3.mountPrivate(r, { idem, need });

  // errors
  r.use((req, res, next) => next(new ApiError(404, 'not_found', 'Route not found')));
  r.use((err, req, res, next) => {
    const status = err.status || 500;
    const known = err instanceof ApiError;
    if (status >= 500 && !known) console.error(err);
    res.status(status).json({ error: {
      code: known ? err.code : status < 500 ? 'invalid_request' : 'internal_error',
      message: known || status < 500 ? err.message : 'Internal error',
    } });
  });
  return r;
};
