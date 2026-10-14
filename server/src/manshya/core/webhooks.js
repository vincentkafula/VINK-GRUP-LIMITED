const crypto = require('crypto');
const { rid, now } = require('./util');

// Signed outbound webhooks: header `X-VINK-Signature: t=<unix>,v1=<hmac_sha256(secret, t + "." + body)>`
//
// Delivery is kept in the database, not in memory, so a restart never loses a retry:
//  - every event is tried straight away; a failure schedules the next try (`next_attempt_at`) with exponential back-off
//    (30 s, 1 min, 2 min ... capped at 1 hour);
//  - the scheduler (runDue) calls retryDue() every minute and delivers whatever is due, claiming each event first so two
//    instances never send the same one twice;
//  - after MAX_ATTEMPTS failures the event is DEAD (a dead letter): it stops retrying, keeps its last error, and can be
//    replayed by hand from the dashboard or with POST /events/:id/replay.
// Receivers must treat the event `id` as an idempotency key: delivery is at least once, so the same id can arrive twice.
const MAX_ATTEMPTS = 8;
const backoffMs = (attempt) => Math.min(30000 * 2 ** (attempt - 1), 3600000);

function buildEmitter(db, { fetchImpl = (...a) => fetch(...a), clock = () => Date.now() } = {}) {
  const iso = (ms) => new Date(ms).toISOString();

  async function deliver(evt) {
    const m = db.prepare('SELECT webhook_url,webhook_secret FROM merchants WHERE id=?').get(evt.merchant_id);
    if (!m || !m.webhook_url) return 'skipped';                                  // nothing to send to: not an error, not retried
    const attempt = (evt.attempts || 0) + 1;
    const body = JSON.stringify({ id: evt.id, type: evt.type, created: evt.created_at, data: JSON.parse(evt.payload) });
    const t = Math.floor(clock() / 1000);
    const v1 = crypto.createHmac('sha256', m.webhook_secret).update(`${t}.${body}`).digest('hex');
    try {
      const r = await fetchImpl(m.webhook_url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000), body,
        headers: { 'content-type': 'application/json', 'x-vink-signature': `t=${t},v1=${v1}`, 'x-vink-event-id': evt.id },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      db.prepare('UPDATE events SET delivered=1,dead=0,attempts=?,next_attempt_at=NULL,last_error=NULL,delivered_at=? WHERE id=?').run(attempt, iso(clock()), evt.id);
      return 'delivered';
    } catch (e) {
      const err = String((e && e.message) || e).slice(0, 200);
      if (attempt >= MAX_ATTEMPTS) {
        db.prepare('UPDATE events SET attempts=?,dead=1,next_attempt_at=NULL,last_error=? WHERE id=?').run(attempt, err, evt.id);
        return 'dead';
      }
      db.prepare('UPDATE events SET attempts=?,next_attempt_at=?,last_error=? WHERE id=?').run(attempt, iso(clock() + backoffMs(attempt)), err, evt.id);
      return 'retry';
    }
  }

  function emit(merchantId, type, data) {
    const evt = { id: rid('evt'), merchant_id: merchantId, type, payload: JSON.stringify(data), created_at: now(), attempts: 0 };
    db.prepare('INSERT INTO events(id,merchant_id,type,payload,created_at) VALUES(?,?,?,?,?)').run(evt.id, evt.merchant_id, evt.type, evt.payload, evt.created_at);
    deliver(evt).catch(() => {});
    return evt.id;
  }

  /** Delivers the events whose retry time has come. Returns how each went. */
  emit.retryDue = async (at = new Date(clock()), limit = 50) => {
    const due = db.prepare('SELECT * FROM events WHERE delivered=0 AND dead=0 AND next_attempt_at IS NOT NULL AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT ?').all(at.toISOString(), limit);
    const out = { delivered: 0, retry: 0, dead: 0, skipped: 0 };
    for (const e of due) {
      // claim it: push the next attempt out a few minutes; if another worker got there first, nothing changes and we skip it
      const claimed = db.prepare('UPDATE events SET next_attempt_at=? WHERE id=? AND next_attempt_at=?').run(iso(at.getTime() + 300000), e.id, e.next_attempt_at);
      if (!claimed.changes) continue;
      out[await deliver(e)] += 1;
    }
    return out;
  };

  /** A merchant's events, newest first. status: all | delivered | pending | dead. */
  emit.list = (merchantId, status = 'all', limit = 50) => {
    const where = { delivered: 'AND delivered=1', pending: 'AND delivered=0 AND dead=0', dead: 'AND dead=1', all: '' }[status] ?? '';
    return db.prepare(`SELECT id,type,created_at,delivered,dead,attempts,next_attempt_at,last_error,delivered_at FROM events WHERE merchant_id=? ${where} ORDER BY created_at DESC LIMIT ?`).all(merchantId, Math.min(Math.max(limit | 0, 1), 200));
  };

  /** Sends an event again from the start (a dead letter, or one that was never delivered). Returns the outcome, or null if it is not theirs. */
  emit.replay = async (merchantId, id) => {
    const e = db.prepare('SELECT * FROM events WHERE id=? AND merchant_id=?').get(id, merchantId);
    if (!e) return null;
    db.prepare('UPDATE events SET delivered=0,dead=0,attempts=0,next_attempt_at=NULL,last_error=NULL WHERE id=?').run(id);
    return deliver({ ...e, attempts: 0 });
  };

  return emit;
}
module.exports = { buildEmitter, MAX_ATTEMPTS, backoffMs };
