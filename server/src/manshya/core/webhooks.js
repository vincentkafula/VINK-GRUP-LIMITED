const crypto = require('crypto');
const { rid, now } = require('./util');

// Signed outbound webhooks: header `X-Manshya-Signature: t=<unix>,v1=<hmac_sha256(secret, t + "." + body)>`
function buildEmitter(db) {
  async function deliver(evt, attempt = 1) {
    const m = db.prepare('SELECT webhook_url,webhook_secret FROM merchants WHERE id=?').get(evt.merchant_id);
    if (!m || !m.webhook_url) return;
    const body = JSON.stringify({ id: evt.id, type: evt.type, created: evt.created_at, data: JSON.parse(evt.payload) });
    const t = Math.floor(Date.now() / 1000);
    const v1 = crypto.createHmac('sha256', m.webhook_secret).update(`${t}.${body}`).digest('hex');
    try {
      const r = await fetch(m.webhook_url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000), body,
        headers: { 'content-type': 'application/json', 'x-manshya-signature': `t=${t},v1=${v1}` },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      db.prepare('UPDATE events SET delivered=1,attempts=? WHERE id=?').run(attempt, evt.id);
    } catch {
      db.prepare('UPDATE events SET attempts=? WHERE id=?').run(attempt, evt.id);
      if (attempt < 5) setTimeout(() => deliver(evt, attempt + 1).catch(() => {}), Math.min(2 ** attempt * 1000, 60000)).unref();
    }
  }
  return function emit(merchantId, type, data) {
    const evt = { id: rid('evt'), merchant_id: merchantId, type, payload: JSON.stringify(data), created_at: now() };
    db.prepare('INSERT INTO events(id,merchant_id,type,payload,created_at) VALUES(?,?,?,?,?)')
      .run(evt.id, evt.merchant_id, evt.type, evt.payload, evt.created_at);
    deliver(evt).catch(() => {});
    return evt.id;
  };
}
module.exports = { buildEmitter };
