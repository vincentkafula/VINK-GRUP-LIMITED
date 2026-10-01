const { ApiError, rid, now, num, text, oneOf } = require('./util');
const { A } = require('./ledger');

const addInterval = (iso, f) => {
  const d = new Date(iso);
  if (f === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else { const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); }
  return d.toISOString();
};
const validDate = (s, name) => {
  const d = new Date(text(s, name, { max: 30 }));
  if (Number.isNaN(d.getTime())) throw new ApiError(400, 'invalid_' + name, `${name} is not a valid date`);
  return d;
};

module.exports = function buildBanking({ db, ledger, core, bills, emit, config, notify, rewards }) {
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const tx = (fn) => db.transaction(fn).immediate();
  const notFound = (w) => new ApiError(404, `${w}_not_found`, `${w.replace('_', ' ')} not found`);
  const merchant = (id) => get('SELECT * FROM merchants WHERE id=?', id);

  /* accounts and beneficiaries */
  function renameAccount(m, id, name) {
    core.getAccount(m.id, id);
    run('UPDATE bank_accounts SET name=? WHERE id=?', text(name, 'name', { max: 60 }), id);
    return core.getAccount(m.id, id);
  }
  function updateBeneficiary(m, id, b = {}) {
    const cur = core.getBeneficiary(m.id, id);
    const acct = b.accountNumber === undefined ? cur.account_number : text(b.accountNumber, 'accountNumber', { max: 16 });
    if (!/^\d{6,16}$/.test(acct)) throw new ApiError(400, 'invalid_accountNumber', 'accountNumber must be 6 to 16 digits');
    const branch = b.branchCode === undefined ? cur.branch_code : text(b.branchCode, 'branchCode', { optional: true, max: 6 });
    if (branch && !/^\d{6}$/.test(branch)) throw new ApiError(400, 'invalid_branchCode', 'branchCode must be 6 digits');
    run('UPDATE beneficiaries SET name=?,bank=?,account_number=?,branch_code=? WHERE id=?', b.name === undefined ? cur.name : text(b.name, 'name', { max: 80 }),
      b.bank === undefined ? cur.bank : text(b.bank, 'bank', { max: 60 }), acct, branch, id);
    return core.getBeneficiary(m.id, id);
  }
  function deleteBeneficiary(m, id) {
    core.getBeneficiary(m.id, id);
    run("UPDATE scheduled_payments SET status='cancelled' WHERE beneficiary_id=? AND status='active'", id);
    run("UPDATE payout_schedules SET status='paused' WHERE destination_type='beneficiary' AND destination_ref=? AND status='active'", id);
    run('DELETE FROM beneficiaries WHERE id=?', id);
    return { ok: true };
  }
  const beneficiaryHistory = (m, id) => { core.getBeneficiary(m.id, id); return { data: all("SELECT * FROM transfers WHERE merchant_id=? AND kind='beneficiary' AND to_ref=? ORDER BY created_at DESC LIMIT 100", m.id, id) }; };

  /* future-dated and recurring payments */
  function createScheduled(m, b = {}) {
    core.getAccount(m.id, b.fromAccountId); core.getBeneficiary(m.id, b.beneficiaryId);
    const start = validDate(b.startDate, 'startDate');
    if (start.toISOString().slice(0, 10) < now().slice(0, 10)) throw new ApiError(400, 'invalid_startDate', 'startDate cannot be in the past');
    const id = rid('sch');
    run('INSERT INTO scheduled_payments(id,merchant_id,from_account,beneficiary_id,amount,reference,frequency,next_run_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      id, m.id, b.fromAccountId, b.beneficiaryId, num(b.amount, 'amount', { min: 100, max: config.bank.perTransferLimit }),
      text(b.reference, 'reference', { optional: true, max: 35 }), oneOf(b.frequency, 'frequency', ['once', 'weekly', 'monthly']), start.toISOString(), now());
    return get('SELECT * FROM scheduled_payments WHERE id=?', id);
  }
  const listScheduled = (m) => ({ data: all("SELECT * FROM scheduled_payments WHERE merchant_id=? AND status!='cancelled' ORDER BY next_run_at", m.id) });
  const cancelScheduled = (m, id) => { if (!run("UPDATE scheduled_payments SET status='cancelled' WHERE id=? AND merchant_id=? AND status='active'", id, m.id).changes) throw notFound('scheduled_payment'); return { id, status: 'cancelled' }; };
  async function runScheduled(at = new Date()) {
    let paid = 0, failed = 0;
    for (const s of all("SELECT * FROM scheduled_payments WHERE status='active' AND next_run_at<=? LIMIT 200", at.toISOString())) {
      const nextRun = s.frequency === 'once' ? s.next_run_at : addInterval(s.next_run_at, s.frequency);
      const claimed = s.frequency === 'once'
        ? run("UPDATE scheduled_payments SET status='completed' WHERE id=? AND status='active' AND next_run_at=?", s.id, s.next_run_at)
        : run('UPDATE scheduled_payments SET next_run_at=? WHERE id=? AND status=\'active\' AND next_run_at=?', nextRun, s.id, s.next_run_at);
      if (claimed.changes !== 1) continue;
      const m = merchant(s.merchant_id);
      try {
        await core.transfer(m, { type: 'beneficiary', fromAccountId: s.from_account, beneficiaryId: s.beneficiary_id, amount: s.amount, reference: s.reference, category: 'Scheduled payments' });
        run("UPDATE scheduled_payments SET failures=0,last_result='paid' WHERE id=?", s.id); paid++;
      } catch (e) {
        const failures = s.failures + 1;
        run('UPDATE scheduled_payments SET failures=?,last_result=?,next_run_at=?,status=? WHERE id=?', failures, String(e.message).slice(0, 120),
          new Date(at.getTime() + 864e5).toISOString(), failures >= 3 ? 'failed' : 'active', s.id);
        notify(m.id, 'transfer', 'Scheduled payment failed', `${s.reference || 'Payment'}: ${e.message}`); failed++;
      }
    }
    return { paid, failed };
  }

  /* savings goals and fixed-term savings (each goal has its own ledger account) */
  const goalAccount = (id) => `goal:${id}`;
  const publicGoal = (g) => { const saved = ledger.balance(goalAccount(g.id)); return {
    id: g.id, name: g.name, target: g.target, saved, progress_pct: Math.min(100, Math.round((saved / g.target) * 100)), lock_until: g.lock_until,
    locked: !!g.lock_until && g.lock_until > now(), rate: g.lock_until ? config.savings.fixedApr : config.savings.flexibleApr, auto: g.auto_amount ? { amount: g.auto_amount, frequency: g.auto_frequency, next: g.next_auto_at, from_account: g.auto_from } : null, status: g.status }; };
  function createGoal(m, b = {}) {
    const id = rid('goal');
    let auto = {};
    if (b.autoAmount !== undefined) {
      core.getAccount(m.id, b.autoFromAccountId);
      auto = { amount: num(b.autoAmount, 'autoAmount', { min: 100, max: 1e9 }), freq: oneOf(b.autoFrequency, 'autoFrequency', ['weekly', 'monthly']), from: b.autoFromAccountId,
        next: b.autoStartDate ? validDate(b.autoStartDate, 'autoStartDate').toISOString() : addInterval(now(), b.autoFrequency) };
    }
    const lock = b.lockUntil ? validDate(b.lockUntil, 'lockUntil').toISOString() : null;
    if (lock && lock <= now()) throw new ApiError(400, 'invalid_lockUntil', 'lockUntil must be in the future');
    run('INSERT INTO savings_goals(id,merchant_id,name,target,lock_until,auto_amount,auto_frequency,auto_from,next_auto_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      id, m.id, text(b.name, 'name', { max: 60 }), num(b.target, 'target', { min: 100, max: 1e11 }), lock, auto.amount || null, auto.freq || null, auto.from || null, auto.next || null, now());
    return publicGoal(get('SELECT * FROM savings_goals WHERE id=?', id));
  }
  const listGoals = (m) => ({ data: all("SELECT * FROM savings_goals WHERE merchant_id=? AND status='active' ORDER BY created_at", m.id).map(publicGoal) });
  function goalMove(m, id, b, dir) {
    const g = get("SELECT * FROM savings_goals WHERE id=? AND merchant_id=? AND status='active'", id, m.id);
    if (!g) throw notFound('goal');
    const acct = core.getAccount(m.id, dir > 0 ? b.fromAccountId : b.toAccountId);
    const amount = num(b.amount, 'amount', { min: 100, max: 1e11 });
    if (dir < 0 && g.lock_until && g.lock_until > now()) throw new ApiError(409, 'locked', `This fixed-term goal is locked until ${g.lock_until.slice(0, 10)}`);
    tx(() => ledger.post('goal', [
      { account: A.bank(acct.id), merchant: m.id, kind: 'bank', amount: -dir * amount, ...(dir > 0 ? { floor: 0 } : {}) },
      { account: goalAccount(id), merchant: m.id, kind: 'savings', amount: dir * amount, ...(dir < 0 ? { floor: 0 } : {}) },
    ], { ref: id, memo: dir > 0 ? `Saved to ${g.name}` : `Withdrawn from ${g.name}` }));
    return publicGoal(g);
  }
  const closeGoal = (m, id) => {
    const g = get("SELECT * FROM savings_goals WHERE id=? AND merchant_id=? AND status='active'", id, m.id);
    if (!g) throw notFound('goal');
    if (ledger.balance(goalAccount(id)) > 0) throw new ApiError(409, 'not_empty', 'Withdraw your savings before closing this goal');
    run("UPDATE savings_goals SET status='closed' WHERE id=?", id);
    return { ok: true };
  };
  function runSavings(at = new Date()) {
    let saved = 0, skipped = 0;
    for (const g of all("SELECT * FROM savings_goals WHERE status='active' AND auto_amount IS NOT NULL AND next_auto_at<=?", at.toISOString())) {
      const next = addInterval(g.next_auto_at, g.auto_frequency);
      if (run('UPDATE savings_goals SET next_auto_at=? WHERE id=? AND next_auto_at=?', next, g.id, g.next_auto_at).changes !== 1) continue;
      try { goalMove(merchant(g.merchant_id), g.id, { fromAccountId: g.auto_from, amount: g.auto_amount }, 1); saved++; } catch { skipped++; }
    }
    return { saved, skipped };
  }

  // Monthly interest on each goal's balance, paid once per calendar month.
  function accrueInterest(at = new Date()) {
    const month = at.toISOString().slice(0, 7); let paid = 0;
    for (const g of all("SELECT * FROM savings_goals WHERE status='active' AND (last_interest IS NULL OR last_interest<?)", month)) {
      if (run('UPDATE savings_goals SET last_interest=? WHERE id=? AND (last_interest IS NULL OR last_interest<?)', month, g.id, month).changes !== 1) continue;
      const interest = Math.floor(ledger.balance(goalAccount(g.id)) * (g.lock_until ? config.savings.fixedApr : config.savings.flexibleApr) / 12);
      if (interest > 0) { tx(() => ledger.post('interest', [{ account: 'sys:interest', kind: 'system', amount: -interest }, { account: goalAccount(g.id), merchant: g.merchant_id, kind: 'savings', amount: interest }], { ref: g.id, memo: `Interest on ${g.name}` })); paid++; }
    }
    return { paid };
  }

  /* prepaid and bill payments */
  const catalogue = () => bills.catalogue().map((p) => ({ id: p.id, category: p.category, name: p.name, recipient: p.recipient, price: p.price || null, min: p.min || p.price, max: p.max || p.price }));
  async function buy(m, b = {}, source = 'bank') {
    const product = bills.catalogue().find((p) => p.id === b.productId);
    if (!product) throw notFound('product');
    const recipient = text(b.recipient, 'recipient', { max: 20 });
    if (!bills.recipientPattern(product.recipient).test(recipient)) throw new ApiError(400, 'invalid_recipient', `That is not a valid ${product.recipient} number`);
    const amount = product.price || num(b.amount, 'amount', { min: product.min, max: product.max });
    const acct = core.getAccount(m.id, b.accountId), id = rid('bill');
    const lines = [{ account: A.bank(acct.id), merchant: m.id, kind: 'bank', amount: -amount, floor: 0 }, { account: 'sys:bills', kind: 'system', amount }];
    tx(() => {
      ledger.post('bill', lines, { ref: id, memo: `${product.name} ${recipient}` });
      run("INSERT INTO bill_purchases(id,merchant_id,account_id,product,category,recipient,amount,status,source,created_at) VALUES(?,?,?,?,?,?,?,'processing',?,?)", id, m.id, acct.id, product.name, product.category, recipient, amount, source, now());
    });
    try {
      const r = await bills.purchase({ product, recipient, amount });
      run("UPDATE bill_purchases SET status='completed',token=?,reference=? WHERE id=?", r.token || null, r.reference || null, id);
      if (rewards) rewards.earn(m.id, `${product.name} cashback`, Math.floor(amount * (config.rewards[product.category] || 0)));
    } catch {
      tx(() => { ledger.post('bill_reversal', ledger.reverse(lines), { ref: id }); run("UPDATE bill_purchases SET status='failed' WHERE id=?", id); });
      throw new ApiError(502, 'provider_error', 'The provider could not complete this purchase. You were not charged.');
    }
    return get('SELECT * FROM bill_purchases WHERE id=?', id);
  }
  const listPurchases = (m, q = {}) => ({ data: all('SELECT * FROM bill_purchases WHERE merchant_id=? AND (? IS NULL OR category=?) AND (? IS NULL OR source=?) ORDER BY created_at DESC LIMIT 100',
    m.id, q.category || null, q.category || null, q.source || null, q.source || null) });

  /* debit orders and DebiCheck mandates */
  function createMandate({ accountNumber, creditor, reference, amount, frequency = 'monthly', debicheck = true }) {
    const a = get('SELECT * FROM bank_accounts WHERE number=?', String(accountNumber));
    if (!a) throw notFound('account');
    const id = rid('do');
    run('INSERT INTO debit_orders(id,merchant_id,account_id,creditor,reference,amount,frequency,status,debicheck,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      id, a.merchant_id, a.id, text(creditor, 'creditor', { max: 80 }), text(reference, 'reference', { optional: true, max: 35 }), num(amount, 'amount', { min: 100, max: 1e9 }),
      oneOf(frequency, 'frequency', ['weekly', 'monthly', 'once']), debicheck ? 'pending_approval' : 'active', debicheck ? 1 : 0, now());
    if (debicheck) notify(a.merchant_id, 'debit_order', 'Approve a debit order', `${creditor} wants to collect ${(amount / 100).toFixed(2)}`);
    return get('SELECT * FROM debit_orders WHERE id=?', id);
  }
  const listDebitOrders = (m) => ({ data: all('SELECT * FROM debit_orders WHERE merchant_id=? ORDER BY created_at DESC LIMIT 100', m.id) });
  function setDebit(m, id, action) {
    const d = get('SELECT * FROM debit_orders WHERE id=? AND merchant_id=?', id, m.id);
    if (!d) throw notFound('debit_order');
    const next = { approve: ['pending_approval', 'active'], decline: ['pending_approval', 'declined'], stop: ['active', 'stopped'] }[action];
    if (!next || d.status !== next[0]) throw new ApiError(409, 'invalid_state', `You cannot ${action} a debit order that is ${d.status.replace('_', ' ')}`);
    run('UPDATE debit_orders SET status=? WHERE id=?', next[1], id);
    return get('SELECT * FROM debit_orders WHERE id=?', id);
  }
  function disputeDebit(m, id) {
    const d = get('SELECT * FROM debit_orders WHERE id=? AND merchant_id=?', id, m.id);
    if (!d) throw notFound('debit_order');
    if (!d.last_collected_at || Date.now() - Date.parse(d.last_collected_at) > 40 * 864e5) throw new ApiError(409, 'not_disputable', 'Only collections from the last 40 days can be disputed');
    run('UPDATE debit_orders SET disputed=1 WHERE id=?', id);
    emit(m.id, 'debit_order.disputed', { id });
    return get('SELECT * FROM debit_orders WHERE id=?', id);
  }
  // Called by your debit-order rail when the creditor's bank presents a collection.
  function collectDebit(id) {
    const d = get('SELECT * FROM debit_orders WHERE id=?', id);
    if (!d || d.status !== 'active') throw new ApiError(409, 'not_collectable', 'This debit order is not active');
    try {
      tx(() => {
        ledger.post('debit_order', [{ account: A.bank(d.account_id), merchant: d.merchant_id, kind: 'bank', amount: -d.amount, floor: 0 }, { account: A.out, kind: 'system', amount: d.amount }], { ref: d.id, memo: `Debit order: ${d.creditor}` });
        run("UPDATE debit_orders SET last_collected_at=?,last_result='paid',status=CASE WHEN frequency='once' THEN 'completed' ELSE status END WHERE id=?", now(), d.id);
      });
    } catch (e) {
      run("UPDATE debit_orders SET last_result='unpaid' WHERE id=?", d.id);
      notify(d.merchant_id, 'debit_order', 'Debit order unpaid', `${d.creditor}: insufficient funds`);
      throw e;
    }
    return get('SELECT * FROM debit_orders WHERE id=?', id);
  }

  /* money management: where money comes from and where it goes */
  function insights(m, monthQ) {
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthQ || '') ? monthQ : now().slice(0, 7);
    const rows = all(`SELECT e.amount,j.kind,j.memo,j.created_at,COALESCE(t.category,b.category) cat FROM entries e
      JOIN journals j ON j.id=e.journal_id JOIN bank_accounts a ON e.account_id='bank:'||a.id
      LEFT JOIN transfers t ON t.id=j.ref LEFT JOIN bill_purchases b ON b.id=j.ref
      WHERE a.merchant_id=? AND substr(j.created_at,1,7)=? AND NOT (j.kind='transfer' AND t.kind='own') AND j.kind NOT IN ('bill_reversal')`, m.id, month);
    const label = (r) => r.cat || { payout: 'Sales payouts', deposit: 'Deposits', debit_order: 'Debit orders', goal: 'Savings', bill: 'Bills and prepaid', transfer: 'Payments', card: 'Card spending', vehicle: 'Vehicle', international: 'International', cash_send: 'Cash sent', inbound: 'Money received' }[r.kind] || 'Other';
    const inn = new Map(), out = new Map(), days = new Map();
    let money_in = 0, money_out = 0;
    for (const r of rows) {
      const c = label(r), d = r.created_at.slice(0, 10), day = days.get(d) || { day: d, in: 0, out: 0 };
      if (r.amount > 0) { money_in += r.amount; inn.set(c, (inn.get(c) || 0) + r.amount); day.in += r.amount; }
      else { money_out -= r.amount; out.set(c, (out.get(c) || 0) - r.amount); day.out -= r.amount; }
      days.set(d, day);
    }
    const list = (map, total) => [...map].map(([category, t]) => ({ category, total: t, share: total ? Math.round((t / total) * 100) : 0 })).sort((a, b) => b.total - a.total);
    return { month, money_in, money_out, net: money_in - money_out, spending: list(out, money_out), income: list(inn, money_in), cash_flow: [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1)) };
  }

  return {
    renameAccount, updateBeneficiary, deleteBeneficiary, beneficiaryHistory, createScheduled, listScheduled, cancelScheduled, runScheduled,
    createGoal, listGoals, deposit: (m, id, b) => goalMove(m, id, b, 1), withdraw: (m, id, b) => goalMove(m, id, b, -1), closeGoal, runSavings, accrueInterest,
    catalogue, buy, listPurchases, createMandate, listDebitOrders, setDebit, disputeDebit, collectDebit, insights,
  };
};
