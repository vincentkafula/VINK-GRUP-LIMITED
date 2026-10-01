const { ApiError, rid, now, num, text, oneOf } = require('./util');
const { A } = require('./ledger');

const PAID = "('paid','partially_refunded','refunded')";
const csvCell = (v) => {
  if (typeof v === 'number') return String(v);
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = (cols, rows) => [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
const addInterval = (iso, interval) => {
  const d = new Date(iso);
  if (interval === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (interval === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else { const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); }
  return d.toISOString();
};
const range = (q) => {
  const today = now().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}/.test(q.from || '') ? q.from.slice(0, 10) + 'T00:00:00.000Z' : today.slice(0, 8) + '01T00:00:00.000Z';
  const to = /^\d{4}-\d{2}-\d{2}/.test(q.to || '') ? q.to.slice(0, 10) + 'T23:59:59.999Z' : today + 'T23:59:59.999Z';
  return { from, to };
};

module.exports = function buildOnline({ db, core, emit, config }) {
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const notFound = (w) => new ApiError(404, `${w}_not_found`, `${w.replace('_', ' ')} not found`);
  const merchant = (id) => get('SELECT * FROM merchants WHERE id=?', id);

  /* unified history: payments, payouts, transfers and bill purchases in one feed */
  function unified(m, q = {}) {
    const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200);
    const term = q.q ? core.like(q.q) : null;
    const type = q.type ? oneOf(q.type, 'type', ['payment', 'payout', 'transfer', 'bill']) : null;
    const rows = db.prepare(`SELECT id,type,sub,created_at,amount,status,label FROM (
        SELECT id,'payment' type,channel sub,created_at,amount,status,COALESCE(customer_name,reference,id) label FROM payments WHERE merchant_id=@m
        UNION ALL SELECT id,'payout',destination_type,created_at,-gross,status,'Payout' FROM payouts WHERE merchant_id=@m
        UNION ALL SELECT id,'transfer',kind,created_at,-amount,status,COALESCE(reference,'Transfer') FROM transfers WHERE merchant_id=@m
        UNION ALL SELECT id,'bill',category,created_at,-amount,status,product||' '||recipient FROM bill_purchases WHERE merchant_id=@m)
      WHERE (@type IS NULL OR type=@type) AND (@q IS NULL OR label LIKE @q ESCAPE '\\' OR id LIKE @q ESCAPE '\\')
        AND (@from IS NULL OR created_at>=@from) AND (@to IS NULL OR created_at<=@to) AND (@before IS NULL OR created_at<@before)
      ORDER BY created_at DESC LIMIT @limit`).all({ m: m.id, type, q: term, from: q.from || null, to: q.to || null, before: q.before || null, limit });
    return { data: rows, next_before: rows.length === limit ? rows[rows.length - 1].created_at : null };
  }

  /* reports */
  function feesReport(m, q = {}) {
    const { from, to } = range(q);
    const days = all(`SELECT substr(created_at,1,10) day,channel,COUNT(*) transactions,SUM(amount) volume,SUM(fee) fees FROM payments
      WHERE merchant_id=? AND status IN ${PAID} AND created_at>=? AND created_at<=? GROUP BY day,channel ORDER BY day DESC,channel`, m.id, from, to);
    const payoutFees = get("SELECT COALESCE(SUM(fee),0) s, COUNT(*) n FROM payouts WHERE merchant_id=? AND status!='failed' AND created_at>=? AND created_at<=?", m.id, from, to);
    const sum = (k) => days.reduce((s, r) => s + r[k], 0);
    return { from, to, rows: days, totals: { transactions: sum('transactions'), volume: sum('volume'), processing_fees: sum('fees'), payout_fees: payoutFees.s, payouts: payoutFees.n, total_fees: sum('fees') + payoutFees.s } };
  }
  function reconciliation(m, q = {}) {
    const { from, to } = range(q);
    const pays = all(`SELECT id,amount,fee,refunded,status,created_at FROM payments WHERE merchant_id=? AND status IN ${PAID} AND created_at>=? AND created_at<=?`, m.id, from, to);
    const ledger = new Map(all(`SELECT j.ref ref,SUM(CASE WHEN e.account_id='sys:clearing' THEN -e.amount ELSE 0 END) gross FROM journals j JOIN entries e ON e.journal_id=j.id
      WHERE j.kind='payment' AND j.ref IN (SELECT id FROM payments WHERE merchant_id=?) GROUP BY j.ref`, m.id).map((r) => [r.ref, r.gross]));
    const unmatched = [], byDay = new Map();
    let gateway = 0, booked = 0;
    for (const p of pays) {
      const l = ledger.get(p.id);
      gateway += p.amount; booked += l || 0;
      if (l === undefined) unmatched.push({ id: p.id, issue: 'no ledger entry', payment_amount: p.amount, ledger_amount: 0 });
      else if (l !== p.amount) unmatched.push({ id: p.id, issue: 'amount differs', payment_amount: p.amount, ledger_amount: l });
      const d = p.created_at.slice(0, 10), r = byDay.get(d) || { day: d, count: 0, total: 0 };
      r.count++; r.total += p.amount; byDay.set(d, r);
    }
    const unbalanced = get('SELECT COUNT(*) n FROM (SELECT journal_id FROM entries GROUP BY journal_id HAVING SUM(amount)!=0)').n;
    const ledgerSum = get('SELECT COALESCE(SUM(amount),0) s FROM entries').s;
    return {
      from, to, ledger_ok: unbalanced === 0 && ledgerSum === 0,
      summary: { payments: pays.length, payments_total: gateway, ledger_total: booked, difference: gateway - booked, unmatched: unmatched.length },
      days: [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1)), unmatched,
    };
  }

  /* settlement import: compare a gateway's settlement file with our records */
  const parseCsv = (t) => {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); if (row.some((x) => x.trim())) rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
    return rows;
  };
  // Columns: gateway_ref, amount (in rand, e.g. 125.50), and optionally date (YYYY-MM-DD).
  function importSettlement(m, b = {}) {
    if (typeof b.csv !== 'string' || !b.csv.trim() || b.csv.length > 90000) throw new ApiError(400, 'invalid_csv', 'Paste the settlement file as CSV text (up to 90 KB)');
    const rows = parseCsv(b.csv), head = rows.shift().map((h) => h.trim().toLowerCase()), ri = head.indexOf('gateway_ref'), ai = head.indexOf('amount'), di = head.indexOf('date');
    if (ri < 0 || ai < 0) throw new ApiError(400, 'invalid_csv', 'The file needs gateway_ref and amount columns');
    if (rows.length > 2000) throw new ApiError(400, 'invalid_csv', 'Up to 2000 rows at a time');
    const file = rows.map((r) => ({ ref: String(r[ri] || '').trim().slice(0, 80), amount: Math.round(parseFloat(String(r[ai] || '').replace(/[^0-9.\-]/g, '')) * 100), date: di >= 0 ? String(r[di] || '').trim().slice(0, 10) : '' }));
    if (file.some((r) => !r.ref || !Number.isFinite(r.amount))) throw new ApiError(400, 'invalid_csv', 'Every row needs a gateway_ref and a numeric amount');
    const ours = new Map(all('SELECT id,gateway_ref,amount,status FROM payments WHERE merchant_id=? AND gateway_ref IN (SELECT value FROM json_each(?))', m.id, JSON.stringify(file.map((r) => r.ref))).map((p) => [p.gateway_ref, p]));
    const mismatch = [], notOurs = [];
    let matched = 0, matchedTotal = 0;
    for (const r of file) {
      const p = ours.get(r.ref);
      if (!p) notOurs.push({ gateway_ref: r.ref, file_amount: r.amount });
      else if (p.amount !== r.amount || !['paid', 'partially_refunded', 'refunded'].includes(p.status)) mismatch.push({ gateway_ref: r.ref, file_amount: r.amount, our_amount: p.amount, our_status: p.status, payment_id: p.id });
      else { matched++; matchedTotal += r.amount; }
    }
    let missing = [];
    const dates = file.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    if (dates.length) {
      const seen = new Set(file.map((r) => r.ref)), to = new Date(Date.parse(dates[dates.length - 1]) + 864e5).toISOString();
      missing = all(`SELECT id,gateway_ref,amount FROM payments WHERE merchant_id=? AND status IN ('paid','partially_refunded','refunded') AND gateway_ref IS NOT NULL AND created_at>=? AND created_at<?`, m.id, dates[0] + 'T00:00:00.000Z', to)
        .filter((p) => !seen.has(p.gateway_ref)).map((p) => ({ payment_id: p.id, gateway_ref: p.gateway_ref, amount: p.amount }));
    }
    return { summary: { rows: file.length, matched, matched_total: matchedTotal, amount_mismatch: mismatch.length, not_in_our_records: notOurs.length, missing_from_file: missing.length, file_total: file.reduce((s, r) => s + r.amount, 0) },
      amount_mismatch: mismatch.slice(0, 200), not_in_our_records: notOurs.slice(0, 200), missing_from_file: missing.slice(0, 200) };
  }

  /* saved cards: gateway tokens only, never card numbers */
  const publicCard = (c) => ({ id: c.id, customer_email: c.customer_email, brand: c.brand, last4: c.last4, expiry: c.expiry, status: c.status, created_at: c.created_at });
  function saveCard(m, b = {}) {
    const email = text(b.customerEmail, 'customerEmail', { max: 120 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'invalid_customerEmail', 'customerEmail is not valid');
    if (!/^\d{4}$/.test(b.last4 || '')) throw new ApiError(400, 'invalid_last4', 'last4 must be 4 digits');
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(b.expiry || '')) throw new ApiError(400, 'invalid_expiry', 'expiry must look like 08/28');
    const gateway = b.gateway || config.defaultGateway;
    if (!core.hasGateway(gateway)) throw new ApiError(400, 'invalid_gateway', 'Unknown gateway');
    const id = rid('card');
    run('INSERT INTO saved_cards(id,merchant_id,customer_email,gateway,token,brand,last4,expiry,agreed_version,agreed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      id, m.id, email, gateway, text(b.token, 'token', { max: 120 }), oneOf(b.brand, 'brand', ['Visa', 'Mastercard', 'Amex', 'Diners']), b.last4, b.expiry, b.agreed === true ? config.cardAgreementVersion : null, b.agreed === true ? now() : null, now());
    return publicCard(get('SELECT * FROM saved_cards WHERE id=?', id));
  }
  const listSavedCards = (m, q = {}) => ({ data: all("SELECT * FROM saved_cards WHERE merchant_id=? AND status='active' AND (? IS NULL OR customer_email LIKE ? ESCAPE '\\') ORDER BY created_at DESC LIMIT 100",
    m.id, q.q ? core.like(q.q) : null, q.q ? core.like(q.q) : null).map(publicCard) });
  function removeSavedCard(m, id) {
    if (!run("UPDATE saved_cards SET status='removed' WHERE id=? AND merchant_id=? AND status='active'", id, m.id).changes) throw notFound('card');
    run("UPDATE subscriptions SET status='cancelled' WHERE saved_card_id=? AND status IN ('active','paused','past_due')", id);
    return { ok: true };
  }

  /* customer subscriptions (recurring card charges) */
  const publicSub = (s) => ({ id: s.id, customer_name: s.customer_name, customer_email: s.customer_email, saved_card_id: s.saved_card_id, amount: s.amount,
    interval: s.interval, next_charge_at: s.next_charge_at, status: s.status, failures: s.failures, created_at: s.created_at });
  function createSubscription(m, b = {}) {
    const card = get("SELECT * FROM saved_cards WHERE id=? AND merchant_id=? AND status='active'", b.savedCardId, m.id);
    if (!card) throw notFound('card');
    const start = b.startDate ? new Date(text(b.startDate, 'startDate', { max: 30 })) : new Date();
    if (Number.isNaN(start.getTime())) throw new ApiError(400, 'invalid_startDate', 'startDate is not a valid date');
    const id = rid('sub');
    run('INSERT INTO subscriptions(id,merchant_id,customer_name,customer_email,saved_card_id,amount,interval,next_charge_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      id, m.id, text(b.customerName, 'customerName', { optional: true, max: 80 }), card.customer_email, card.id,
      num(b.amount, 'amount', { min: 100, max: 100000000 }), oneOf(b.interval, 'interval', ['weekly', 'monthly']), start.toISOString(), now());
    return publicSub(get('SELECT * FROM subscriptions WHERE id=?', id));
  }
  const listSubscriptions = (m, q = {}) => ({ data: all('SELECT * FROM subscriptions WHERE merchant_id=? AND (? IS NULL OR status=?) ORDER BY created_at DESC LIMIT 100', m.id, q.status || null, q.status || null).map(publicSub) });
  function setSubscription(m, id, status) {
    oneOf(status, 'status', ['active', 'paused', 'cancelled']);
    const s = get('SELECT * FROM subscriptions WHERE id=? AND merchant_id=?', id, m.id);
    if (!s) throw notFound('subscription');
    if (s.status === 'cancelled') throw new ApiError(409, 'cancelled', 'A cancelled subscription cannot be changed');
    run('UPDATE subscriptions SET status=?,failures=CASE WHEN ?=\'active\' THEN 0 ELSE failures END WHERE id=?', status, status, id);
    return publicSub(get('SELECT * FROM subscriptions WHERE id=?', id));
  }
  async function runSubscriptions(at = new Date()) {
    const nowIso = at.toISOString(), due = all("SELECT * FROM subscriptions WHERE status='active' AND next_charge_at<=? LIMIT 200", nowIso);
    let charged = 0, failed = 0;
    for (const s of due) {
      const advanced = addInterval(s.next_charge_at, s.interval);
      // Claim by moving the due date first, so two runners can never charge the same cycle.
      if (run('UPDATE subscriptions SET next_charge_at=? WHERE id=? AND next_charge_at=? AND status=?', advanced, s.id, s.next_charge_at, 'active').changes !== 1) continue;
      const m = merchant(s.merchant_id), card = get('SELECT * FROM saved_cards WHERE id=?', s.saved_card_id);
      let p = null;
      try {
        if (!card || card.status !== 'active') throw new Error('card removed');
        p = await core.createPayment(m, { amount: s.amount, method: 'card', gateway: card.gateway, paymentToken: card.token, reference: `Subscription ${s.id}`, customer: { name: s.customer_name, email: s.customer_email } });
      } catch { p = null; }
      if (p && p.status === 'paid') {
        run('UPDATE subscriptions SET failures=0,last_payment_id=? WHERE id=?', p.id, s.id); charged++;
        emit(m.id, 'subscription.charged', { id: s.id, payment_id: p.id });
      } else {
        const failures = s.failures + 1, retry = new Date(at.getTime() + 864e5).toISOString();
        run('UPDATE subscriptions SET failures=?,next_charge_at=?,status=? WHERE id=?', failures, retry, failures >= 3 ? 'past_due' : 'active', s.id); failed++;
        emit(m.id, 'subscription.failed', { id: s.id, failures });
      }
    }
    return { charged, failed };
  }

  /* payout schedules */
  const publicSchedule = (s) => ({ id: s.id, frequency: s.frequency, day: s.day, min_amount: s.min_amount, destination: { type: s.destination_type, ref: s.destination_ref }, status: s.status, last_run_at: s.last_run_at, created_at: s.created_at });
  function createSchedule(m, b = {}) {
    const frequency = oneOf(b.frequency, 'frequency', ['daily', 'weekly', 'monthly']);
    const day = frequency === 'weekly' ? num(b.day, 'day', { min: 0, max: 6 }) : frequency === 'monthly' ? num(b.day, 'day', { min: 1, max: 28 }) : null;
    const d = b.destination || {};
    const type = oneOf(d.type, 'destination.type', ['bank_account', 'beneficiary']);
    let ref;
    if (type === 'bank_account') { core.getAccount(m.id, d.accountId); ref = d.accountId; } else { ref = core.getBeneficiary(m.id, d.beneficiaryId).id; }
    const id = rid('psc');
    run('INSERT INTO payout_schedules(id,merchant_id,frequency,day,min_amount,destination_type,destination_ref,created_at) VALUES(?,?,?,?,?,?,?,?)',
      id, m.id, frequency, day, b.minAmount === undefined ? 10000 : num(b.minAmount, 'minAmount', { min: 0, max: 1e10 }), type, ref, now());
    return publicSchedule(get('SELECT * FROM payout_schedules WHERE id=?', id));
  }
  const listSchedules = (m) => ({ data: all('SELECT * FROM payout_schedules WHERE merchant_id=? AND status!=\'deleted\' ORDER BY created_at DESC', m.id).map(publicSchedule) });
  function setSchedule(m, id, status) {
    oneOf(status, 'status', ['active', 'paused', 'deleted']);
    if (!run('UPDATE payout_schedules SET status=? WHERE id=? AND merchant_id=? AND status!=\'deleted\'', status, id, m.id).changes) throw notFound('schedule');
    return { id, status };
  }
  async function runPayoutSchedules(at = new Date()) {
    const today = at.toISOString().slice(0, 10);
    let paid = 0, skipped = 0;
    for (const s of all("SELECT * FROM payout_schedules WHERE status='active'")) {
      const dueToday = s.frequency === 'daily' || (s.frequency === 'weekly' && at.getUTCDay() === s.day) || (s.frequency === 'monthly' && at.getUTCDate() === s.day);
      if (!dueToday || (s.last_run_at && s.last_run_at.slice(0, 10) === today)) continue;
      if (run('UPDATE payout_schedules SET last_run_at=? WHERE id=? AND (last_run_at IS ? OR last_run_at=?)', at.toISOString(), s.id, s.last_run_at, s.last_run_at).changes !== 1) continue;
      const m = merchant(s.merchant_id);
      if (core.balance(m).available_for_payout < Math.max(s.min_amount, 1)) { skipped++; continue; }
      try {
        await core.requestPayout(m, { destination: s.destination_type === 'bank_account' ? { type: 'bank_account', accountId: s.destination_ref } : { type: 'beneficiary', beneficiaryId: s.destination_ref } });
        paid++;
      } catch { skipped++; }
    }
    return { paid, skipped };
  }

  /* payment buttons: reusable hosted pay links */
  function createButton(m, b = {}) {
    const id = rid('btn'), token = require('crypto').randomBytes(18).toString('base64url');
    run('INSERT INTO payment_buttons(id,merchant_id,token,label,amount,created_at) VALUES(?,?,?,?,?,?)', id, m.id, token, text(b.label, 'label', { max: 80 }),
      b.amount === undefined || b.amount === null ? null : num(b.amount, 'amount', { min: 100, max: 100000000 }), now());
    return publicButton(get('SELECT * FROM payment_buttons WHERE id=?', id));
  }
  const publicButton = (b) => ({ id: b.id, token: b.token, label: b.label, amount: b.amount, status: b.status, created_at: b.created_at, path: `/public/buttons/${b.token}` });
  const listButtons = (m) => ({ data: all("SELECT * FROM payment_buttons WHERE merchant_id=? AND status='active' ORDER BY created_at DESC", m.id).map(publicButton) });
  const disableButton = (m, id) => { if (!run("UPDATE payment_buttons SET status='disabled' WHERE id=? AND merchant_id=?", id, m.id).changes) throw notFound('button'); return { ok: true }; };
  function getButtonPublic(token) {
    const b = get("SELECT * FROM payment_buttons WHERE token=? AND status='active'", String(token));
    if (!b) throw notFound('button');
    return { merchant: get('SELECT name FROM merchants WHERE id=?', b.merchant_id).name, label: b.label, amount: b.amount };
  }
  async function payButton(token, body = {}) {
    const b = get("SELECT * FROM payment_buttons WHERE token=? AND status='active'", String(token));
    if (!b) throw notFound('button');
    const amount = b.amount !== null ? b.amount : num(body.amount, 'amount', { min: 100, max: 5000000 }); // fixed prices cannot be overridden
    const p = await core.createPayment(merchant(b.merchant_id), { amount, method: body.method, paymentToken: body.paymentToken, reference: b.label, customer: { name: body.name, email: body.email } });
    return { status: p.status, payment: p };
  }

  return {
    unified, feesReport, reconciliation, importSettlement, toCsv, saveCard, listSavedCards, removeSavedCard, createSubscription, listSubscriptions, setSubscription, runSubscriptions,
    createSchedule, listSchedules, setSchedule, runPayoutSchedules, createButton, listButtons, disableButton, getButtonPublic, payButton,
  };
};
