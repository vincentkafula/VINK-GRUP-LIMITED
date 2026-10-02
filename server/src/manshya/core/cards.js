const crypto = require('crypto');
const { ApiError, rid, now, num, text, oneOf } = require('./util');
const { A } = require('./ledger');

// Card management. Real issuing needs an issuer processor: it would call authorize() from its authorization webhook.
module.exports = function buildCards({ db, ledger, config, rewards, notify }) {
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const tx = (fn) => db.transaction(fn).immediate();
  const notFound = () => new ApiError(404, 'card_not_found', 'card not found');
  const pub = (c) => ({ id: c.id, account_id: c.account_id, brand: c.brand, last4: c.last4, kind: c.kind, status: c.status, limit: c.spend_limit, daily_limit: c.daily_limit,
    tap: !!c.tap, international: !!c.intl, online: !!c.online, wallets: c.wallets ? c.wallets.split(',') : [], replaced_by: c.replaced_by, blocked_reason: c.blocked_reason });
  const card = (m, id) => { const c = get('SELECT * FROM cards WHERE id=? AND merchant_id=?', id, m.id); if (!c) throw notFound(); return c; };
  const last4 = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');

  function order(m, b = {}, replacing) {
    const acct = get('SELECT id FROM bank_accounts WHERE id=? AND merchant_id=?', b.accountId, m.id);
    if (!acct) throw new ApiError(404, 'account_not_found', 'account not found');
    const id = rid('card');
    run("INSERT INTO cards(id,merchant_id,account_id,brand,last4,spend_limit,status,kind,daily_limit,created_at) VALUES(?,?,?,?,?,?,'inactive',?,?,?)", id, m.id, acct.id, 'Visa', last4(),
      b.limit === undefined ? 1200000 : num(b.limit, 'limit', { min: 0, max: 1e9 }), oneOf(b.kind || 'debit', 'kind', ['debit', 'virtual']),
      b.dailyLimit === undefined ? 500000 : num(b.dailyLimit, 'dailyLimit', { min: 0, max: 1e9 }), now());
    return pub(get('SELECT * FROM cards WHERE id=?', id));
  }
  const list = (m) => ({ data: all('SELECT * FROM cards WHERE merchant_id=? ORDER BY created_at DESC', m.id).map(pub) });
  function activate(m, id) {
    card(m, id);
    if (!run("UPDATE cards SET status='active' WHERE id=? AND status='inactive'", id).changes) throw new ApiError(409, 'not_inactive', 'Only a new card that has not been activated can be activated');
    return pub(get('SELECT * FROM cards WHERE id=?', id));
  }
  function update(m, id, b = {}) {
    const c = card(m, id), set = {};
    if (b.status !== undefined) {
      oneOf(b.status, 'status', ['active', 'frozen']);
      if (!['active', 'frozen'].includes(c.status)) throw new ApiError(409, 'not_changeable', `A ${c.status} card cannot be ${b.status === 'frozen' ? 'frozen' : 'unfrozen'}`);
      set.status = b.status;
    }
    for (const [k, col] of [['tap', 'tap'], ['international', 'intl'], ['online', 'online']]) if (b[k] !== undefined) { if (typeof b[k] !== 'boolean') throw new ApiError(400, 'invalid_' + k, `${k} must be true or false`); set[col] = b[k] ? 1 : 0; }
    if (b.limit !== undefined) set.spend_limit = num(b.limit, 'limit', { min: 0, max: 1e9 });
    if (b.dailyLimit !== undefined) set.daily_limit = num(b.dailyLimit, 'dailyLimit', { min: 0, max: 1e9 });
    const keys = Object.keys(set);
    if (keys.length) run(`UPDATE cards SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`, ...keys.map((k) => set[k]), id);
    return pub(get('SELECT * FROM cards WHERE id=?', id));
  }
  // Lost or stolen: block for good and order a replacement.
  function block(m, id, reason = 'lost') {
    oneOf(reason, 'reason', ['lost', 'stolen', 'fraud']);
    const c = card(m, id);
    if (c.status === 'blocked') throw new ApiError(409, 'already_blocked', 'This card is already blocked');
    run("UPDATE cards SET status='blocked',blocked_reason=? WHERE id=?", reason, id);
    const repl = order(m, { accountId: c.account_id, kind: c.kind, limit: c.spend_limit, dailyLimit: c.daily_limit });
    run('UPDATE cards SET replaced_by=? WHERE id=?', repl.id, id);
    notify(m.id, 'card', 'Card blocked', `Your card ending ${c.last4} is blocked. A replacement is on its way.`);
    return { blocked: pub(get('SELECT * FROM cards WHERE id=?', id)), replacement: repl };
  }
  function wallet(m, id, name, action = 'add') {
    const c = card(m, id);
    oneOf(name, 'wallet', ['apple', 'google', 'samsung']); oneOf(action, 'action', ['add', 'remove']);
    if (c.status !== 'active') throw new ApiError(409, 'not_active', 'Activate the card before linking it to a wallet');
    const cur = c.wallets ? c.wallets.split(',') : [], next = action === 'add' ? [...new Set([...cur, name])] : cur.filter((w) => w !== name);
    run('UPDATE cards SET wallets=? WHERE id=?', next.join(','), id);
    return pub(get('SELECT * FROM cards WHERE id=?', id));
  }
  // The card controls take real effect here: status, tap, online and international switches and both limits.
  function authorize(m, b = {}) {
    const c = card(m, b.cardId), amount = num(b.amount, 'amount', { min: 1, max: 1e10 }), channel = oneOf(b.channel || 'chip', 'channel', ['chip', 'tap', 'online', 'international']);
    const day = now().slice(0, 10), month = now().slice(0, 7), sum = (p) => get("SELECT COALESCE(SUM(amount),0) s FROM card_transactions WHERE card_id=? AND status='approved' AND substr(created_at,1,?)=?", c.id, p.length, p).s;
    let reason = null;
    if (c.status !== 'active') reason = `card_${c.status}`;
    else if (channel === 'tap' && !c.tap) reason = 'tap_disabled';
    else if (channel === 'online' && !c.online) reason = 'online_disabled';
    else if (channel === 'international' && !c.intl) reason = 'international_disabled';
    else if (sum(day) + amount > c.daily_limit) reason = 'daily_limit';
    else if (sum(month) + amount > c.spend_limit) reason = 'monthly_limit';
    const id = rid('ctx'), descriptor = text(b.descriptor, 'descriptor', { optional: true, max: 60 });
    if (!reason) {
      try {
        tx(() => ledger.post('card', [{ account: A.bank(c.account_id), merchant: m.id, kind: 'bank', amount: -amount, floor: 0 }, { account: 'sys:card_settlement', kind: 'system', amount }], { ref: id, memo: descriptor || 'Card purchase' }));
      } catch (e) { if (e.code !== 'insufficient_funds') throw e; reason = 'insufficient_funds'; }
    }
    run('INSERT INTO card_transactions(id,card_id,merchant_id,amount,channel,status,reason,descriptor,created_at) VALUES(?,?,?,?,?,?,?,?,?)', id, c.id, m.id, amount, channel, reason ? 'declined' : 'approved', reason, descriptor, now());
    if (!reason) rewards.earn(m.id, 'Card cashback', Math.floor(amount * (config.rewards.card || 0)));
    return { id, approved: !reason, reason };
  }
  const transactions = (m, cardId) => { if (cardId) card(m, cardId); return { data: all('SELECT id,card_id,amount,channel,status,reason,descriptor,created_at FROM card_transactions WHERE merchant_id=? AND (? IS NULL OR card_id=?) ORDER BY created_at DESC LIMIT 100', m.id, cardId || null, cardId || null) }; };
  /* ---------- issuer-processor integration ---------- */

  /** Remember which provider card id belongs to one of our cards. */
  function linkProviderCard(m, cardId, provider, providerCardId) {
    card(m, cardId);
    text(provider, 'provider', { max: 40 }); text(providerCardId, 'providerCardId', { max: 80 });
    try { run('UPDATE cards SET provider=?, provider_card_id=? WHERE id=?', provider, providerCardId, cardId); }
    catch (e) { if (/UNIQUE/.test(e.message)) throw new ApiError(409, 'provider_card_in_use', 'That provider card is already linked'); throw e; }
    return pub(get('SELECT * FROM cards WHERE id=?', cardId));
  }

  /**
   * Decide one real-time authorisation from the issuer-processor. Processors retry, so this is IDEMPOTENT per
   * (provider, authorisationId): a repeat returns the first decision and never spends the money twice.
   * Anything we cannot decide safely is a decline (never a throw), because the processor needs an answer.
   */
  function authoriseFromProvider({ provider, authorisationId, providerCardId, amount, currency = 'ZAR', channel = 'chip', descriptor }) {
    return tx(() => {
      const prior = get('SELECT * FROM authorisations WHERE provider=? AND authorisation_id=?', provider, authorisationId);
      if (prior) return { id: prior.card_tx_id, approved: !!prior.approved, reason: prior.reason, replayed: true };
      const record = (cardTxId, approved, reason) => {
        run('INSERT INTO authorisations(provider,authorisation_id,card_tx_id,approved,reason,amount,created_at) VALUES(?,?,?,?,?,?,?)', provider, authorisationId, cardTxId, approved ? 1 : 0, reason, Number.isInteger(amount) ? amount : null, now());
        return { id: cardTxId, approved, reason, replayed: false };
      };
      const c = get('SELECT * FROM cards WHERE provider=? AND provider_card_id=?', provider, providerCardId);
      if (!c) return record(null, false, 'unknown_card');
      if (!Number.isInteger(amount) || amount < 1) return record(null, false, 'invalid_amount');
      if (currency !== 'ZAR') return record(null, false, 'currency_not_supported');
      const m = get('SELECT * FROM merchants WHERE id=?', c.merchant_id);
      if (!m || m.status === 'suspended') return record(null, false, 'account_suspended');
      const mapped = channel === 'atm' ? 'chip' : channel;
      if (!['chip', 'tap', 'online', 'international'].includes(mapped)) return record(null, false, 'channel_not_supported');
      const r = authorize(m, { cardId: c.id, amount, channel: mapped, descriptor: descriptor ? String(descriptor).slice(0, 60) : undefined });
      return record(r.id, r.approved, r.reason);
    });
  }

  return { order, list, activate, update, block, wallet, authorize, transactions, linkProviderCard, authoriseFromProvider };
};
