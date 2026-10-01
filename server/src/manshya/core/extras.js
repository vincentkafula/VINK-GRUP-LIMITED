const crypto = require('crypto');
const { ApiError, rid, now, sha256, num, text, oneOf } = require('./util');
const { A } = require('./ledger');

const FAQS = [
  { topic: 'Payments', q: 'How long do payouts take?', a: 'Payouts to a Manshya account are instant. Payouts to other banks usually arrive the same business day.' },
  { topic: 'Payments', q: 'What are the fees?', a: 'Online payments cost 2.9% + R1.00, card machine payments 2.5%, and each payout R8.50. See Payouts and billing.' },
  { topic: 'Cards', q: 'What do I do if my card is lost or stolen?', a: 'Open Support, choose Report a lost or stolen card, and pick the card. It is blocked straight away and a replacement is ordered.' },
  { topic: 'Cards', q: 'How do I stop my card being used abroad?', a: 'Open Cards and turn International transactions off. You can turn it back on at any time.' },
  { topic: 'Account', q: 'Why is some of my balance retained?', a: 'Until your business is verified we hold back 10% of each sale. It is released once your documents are approved.' },
  { topic: 'Banking', q: 'Can I stop a debit order?', a: 'Yes. Open Debit orders, choose the order and tap Stop. If a recent collection was wrong, tap Dispute.' },
  { topic: 'Banking', q: 'What is the limit for instant payments?', a: 'Instant payments to a cellphone number are limited per payment. The limit is shown when you send one.' },
];
const GUIDES = [
  { title: 'Take your first payment', steps: ['Open Settings, then Integration, and copy your API base URL.', 'Create an API key under Developer settings.', 'Send a test payment from your server.', 'Watch it appear under Transactions.'] },
  { title: 'Set up automatic payouts', steps: ['Open Payout, then Payout schedule.', 'Choose how often and the minimum amount.', 'Choose where the money should go.'] },
];
const PLACES = [
  { id: 'b1', type: 'branch', name: 'Cape Town CBD branch', address: '1 Adderley Street, Cape Town', lat: -33.9249, lng: 18.4241, hours: 'Mon-Fri 9:00-16:30, Sat 9:00-12:00' },
  { id: 'b2', type: 'branch', name: 'Sandton branch', address: '12 Rivonia Road, Sandton', lat: -26.1076, lng: 28.0567, hours: 'Mon-Fri 9:00-16:30, Sat 9:00-12:00' },
  { id: 'b3', type: 'branch', name: 'Durban branch', address: '34 West Street, Durban', lat: -29.8587, lng: 31.0218, hours: 'Mon-Fri 9:00-16:30' },
  { id: 'a1', type: 'atm', name: 'V&A Waterfront ATM', address: 'Victoria Wharf, Cape Town', lat: -33.9036, lng: 18.4208, hours: '24 hours' },
  { id: 'a2', type: 'atm', name: 'Gateway ATM', address: 'Gateway Theatre of Shopping, Umhlanga', lat: -29.7263, lng: 31.0658, hours: '24 hours' },
  { id: 'a3', type: 'atm', name: 'Rosebank ATM', address: 'The Zone, Rosebank', lat: -26.1457, lng: 28.0436, hours: '6:00-22:00' },
];
const OFFERS = [
  { id: 'offer-1', title: 'Sample offer: 10% off at a partner fuel station', ends: 'Ends 31 Dec' },
  { id: 'offer-2', title: 'Sample offer: free delivery at a partner supplier', ends: 'Ends 30 Nov' },
  { id: 'offer-3', title: 'Sample offer: R50 off a first airtime bundle over R200', ends: 'Ongoing' },
];
const km = (a, b, c, d) => { const r = (x) => (x * Math.PI) / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return Math.round(12742 * Math.asin(Math.sqrt(h)) * 10) / 10; };

// Rewards, customer support, buyer account and vehicle licence renewal.
module.exports = function buildExtras({ db, ledger, core, cards, vehicle, config, mail, notify }) {
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const tx = (fn) => db.transaction(fn).immediate();
  const notFound = (w) => new ApiError(404, `${w}_not_found`, `${w.replace('_', ' ')} not found`);

  /* rewards: cashback on bills and card spend, redeemable into any account */
  const rbal = (mid) => ledger.balance(`rewards:${mid}`);
  function earn(mid, memo, amount) {
    if (!(amount > 0)) return;
    try { tx(() => { ledger.post('reward', [{ account: 'sys:rewards_pool', kind: 'system', amount: -amount }, { account: `rewards:${mid}`, merchant: mid, kind: 'rewards', amount }], { memo }); run('INSERT INTO rewards(merchant_id,memo,amount,created_at) VALUES(?,?,?,?)', mid, memo, amount, now()); }); } catch { /* rewards never block a purchase */ }
  }
  const rewardsSummary = (m) => ({ balance: rbal(m.id), history: all('SELECT memo,amount,created_at FROM rewards WHERE merchant_id=? ORDER BY id DESC LIMIT 30', m.id), offers: config.offers || OFFERS });
  function redeem(m, b = {}) {
    const acct = core.getAccount(m.id, b.accountId), bal = rbal(m.id);
    if (bal <= 0) throw new ApiError(409, 'nothing_to_redeem', 'You have no cashback to redeem yet');
    tx(() => {
      ledger.post('reward_redeem', [{ account: `rewards:${m.id}`, merchant: m.id, kind: 'rewards', amount: -bal, floor: 0 }, { account: A.bank(acct.id), merchant: m.id, kind: 'bank', amount: bal }], { memo: 'Cashback redeemed' });
      run('INSERT INTO rewards(merchant_id,memo,amount,created_at) VALUES(?,?,?,?)', m.id, 'Redeemed to account', -bal, now());
    });
    return { redeemed: bal };
  }

  /* support */
  const ticket = (m, id) => { const t = get('SELECT * FROM support_tickets WHERE id=? AND merchant_id=?', id, m.id); if (!t) throw notFound('ticket'); return t; };
  function createTicket(m, b = {}, author = 'customer') {
    const id = rid('tkt'), t = now();
    run('INSERT INTO support_tickets(id,merchant_id,category,subject,created_at,updated_at) VALUES(?,?,?,?,?,?)', id, m.id, oneOf(b.category || 'general', 'category', ['general', 'payments', 'card', 'fraud', 'account']), text(b.subject, 'subject', { max: 120 }), t, t);
    run('INSERT INTO support_messages(ticket_id,author,body,created_at) VALUES(?,?,?,?)', id, author, text(b.message, 'message', { max: 2000 }), t);
    return getTicket(m, id);
  }
  const listTickets = (m) => ({ data: all('SELECT * FROM support_tickets WHERE merchant_id=? ORDER BY updated_at DESC LIMIT 50', m.id) });
  const getTicket = (m, id) => ({ ...ticket(m, id), messages: all('SELECT author,body,created_at FROM support_messages WHERE ticket_id=? ORDER BY id', id) });
  function reply(m, id, body) {
    const t = ticket(m, id);
    if (t.status === 'closed') throw new ApiError(409, 'closed', 'This ticket is closed. Open a new one.');
    run('INSERT INTO support_messages(ticket_id,author,body,created_at) VALUES(?,?,?,?)', id, 'customer', text(body, 'message', { max: 2000 }), now());
    run("UPDATE support_tickets SET status='open',updated_at=? WHERE id=?", now(), id);
    return getTicket(m, id);
  }
  const closeTicket = (m, id) => { ticket(m, id); run("UPDATE support_tickets SET status='closed',updated_at=? WHERE id=?", now(), id); return { id, status: 'closed' }; };
  const adminTickets = (status) => ({ data: all('SELECT t.*,m.name merchant FROM support_tickets t JOIN merchants m ON m.id=t.merchant_id WHERE (? IS NULL OR t.status=?) ORDER BY t.updated_at DESC LIMIT 200', status || null, status || null) });
  function adminReply(id, body) {
    const t = get('SELECT * FROM support_tickets WHERE id=?', id);
    if (!t) throw notFound('ticket');
    run('INSERT INTO support_messages(ticket_id,author,body,created_at) VALUES(?,?,?,?)', id, 'support', text(body, 'message', { max: 2000 }), now());
    run("UPDATE support_tickets SET status='answered',updated_at=? WHERE id=?", now(), id);
    notify(t.merchant_id, 'support', 'Support replied', t.subject);
    return { id, status: 'answered' };
  }
  function reportFraud(m, b = {}) {
    const kind = oneOf(b.kind, 'kind', ['lost_card', 'stolen_card', 'fraud', 'suspicious_payment']);
    let blocked = null;
    if (b.cardId && kind !== 'suspicious_payment') blocked = cards.block(m, b.cardId, kind === 'lost_card' ? 'lost' : kind === 'stolen_card' ? 'stolen' : 'fraud');
    const t = createTicket(m, { category: 'fraud', subject: kind.replace('_', ' ') + ' reported', message: text(b.details, 'details', { optional: true, max: 1500 }) || 'Reported in the app.' });
    return { ticket_id: t.id, card: blocked };
  }
  const faqs = (q) => ({ faqs: FAQS.filter((f) => !q || (f.q + f.a + f.topic).toLowerCase().includes(String(q).toLowerCase().slice(0, 60))), guides: GUIDES, contact: config.support || { phone: '0800 000 000', whatsapp: '+27 60 000 0000', email: 'help@manshya.example' } });
  function locations(q = {}) {
    const lat = parseFloat(q.lat), lng = parseFloat(q.lng), type = q.type ? oneOf(q.type, 'type', ['branch', 'atm']) : null, here = Number.isFinite(lat) && Number.isFinite(lng);
    return { data: PLACES.filter((p) => !type || p.type === type).map((p) => ({ ...p, distance_km: here ? km(lat, lng, p.lat, p.lng) : null })).sort((a, b) => (here ? a.distance_km - b.distance_km : a.name.localeCompare(b.name))) };
  }

  /* buyer account: the signed-in user's own purchases, subscriptions and saved cards, matched by a VERIFIED email */
  function startBuyerVerify(m) {
    const email = (core.profileEmail && core.profileEmail(m)) || null;
    if (!email) throw new ApiError(409, 'set_email_first', 'Add your email under Personal information first');
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    run('INSERT INTO buyer_links(merchant_id,email,code_hash,expires_at,attempts) VALUES(?,?,?,?,0) ON CONFLICT(merchant_id) DO UPDATE SET email=excluded.email,code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,verified_at=NULL',
      m.id, email, sha256(`${m.id}:${code}`), new Date(Date.now() + 10 * 60e3).toISOString());
    mail(m.id, email, 'Your Manshya verification code', `Your code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this message.`);
    return { sent: true };
  }
  function confirmBuyerVerify(m, code) {
    const l = get('SELECT * FROM buyer_links WHERE merchant_id=?', m.id);
    if (!l || !l.code_hash || l.expires_at < now()) throw new ApiError(409, 'no_code', 'Ask for a new code');
    if (l.attempts >= 5) throw new ApiError(423, 'locked', 'Too many wrong codes. Ask for a new one.');
    const want = Buffer.from(l.code_hash), got = Buffer.from(sha256(`${m.id}:${String(code || '')}`));
    if (!crypto.timingSafeEqual(want, got)) { run('UPDATE buyer_links SET attempts=attempts+1 WHERE merchant_id=?', m.id); throw new ApiError(401, 'wrong_code', 'Wrong code'); }
    run('UPDATE buyer_links SET verified_at=?,code_hash=NULL WHERE merchant_id=?', now(), m.id);
    return { verified: true, email: l.email };
  }
  function buyerEmail(m) {
    const l = get('SELECT * FROM buyer_links WHERE merchant_id=?', m.id), cur = core.profileEmail && core.profileEmail(m);
    if (!l || !l.verified_at || !cur || l.email !== cur) throw new ApiError(403, 'verify_email', 'Verify your email to see your buyer account');
    return l.email;
  }
  const buyerStatus = (m) => { const l = get('SELECT email,verified_at FROM buyer_links WHERE merchant_id=?', m.id); const cur = core.profileEmail && core.profileEmail(m); return { email: cur || null, verified: !!(l && l.verified_at && l.email === cur) }; };
  const buyerPurchases = (m) => ({ data: all("SELECT p.id,x.name merchant,p.reference,p.amount,p.status,p.created_at FROM payments p JOIN merchants x ON x.id=p.merchant_id WHERE lower(p.customer_email)=? AND p.status IN ('paid','partially_refunded','refunded') ORDER BY p.created_at DESC LIMIT 100", buyerEmail(m)) });
  const buyerSubs = (m) => ({ data: all('SELECT s.id,x.name merchant,s.amount,s.interval,s.next_charge_at,s.status FROM subscriptions s JOIN merchants x ON x.id=s.merchant_id WHERE lower(s.customer_email)=? ORDER BY s.created_at DESC', buyerEmail(m)) });
  function buyerSetSub(m, id, status) {
    oneOf(status, 'status', ['active', 'paused', 'cancelled']);
    const r = run("UPDATE subscriptions SET status=? WHERE id=? AND lower(customer_email)=? AND status!='cancelled'", status, id, buyerEmail(m));
    if (!r.changes) throw notFound('subscription');
    return { id, status };
  }
  const buyerCards = (m) => ({ agreement: { version: config.cardAgreementVersion, text: 'You allow the business named below to charge this card for the amounts you agreed to. You can remove the card at any time and future charges stop.' },
    data: all("SELECT c.id,x.name merchant,c.brand,c.last4,c.expiry,c.agreed_version,c.agreed_at FROM saved_cards c JOIN merchants x ON x.id=c.merchant_id WHERE lower(c.customer_email)=? AND c.status='active' ORDER BY c.created_at DESC", buyerEmail(m)) });
  function buyerRemoveCard(m, id) {
    const e = buyerEmail(m);
    if (!run("UPDATE saved_cards SET status='removed' WHERE id=? AND lower(customer_email)=? AND status='active'", id, e).changes) throw notFound('card');
    run("UPDATE subscriptions SET status='cancelled' WHERE saved_card_id=? AND status!='cancelled'", id);
    return { ok: true };
  }

  /* vehicle licence disc renewal */
  const plateOf = (p) => { const t = text(p, 'plate', { max: 12 }).toUpperCase().trim(); if (!/^[A-Z0-9 ]{4,12}$/.test(t)) throw new ApiError(400, 'invalid_plate', 'That is not a valid registration number'); return t; };
  const vehicleLookup = (plate) => vehicle.lookup(plateOf(plate));
  async function vehicleRenew(m, b = {}) {
    const plate = plateOf(b.plate), acct = core.getAccount(m.id, b.accountId), info = await vehicle.lookup(plate);
    let delivery = null;
    if (b.delivery) { delivery = text(b.delivery.address, 'delivery.address', { max: 200 }); }
    const amount = info.fee + (delivery ? info.delivery_fee : 0), id = rid('veh');
    const lines = [{ account: A.bank(acct.id), merchant: m.id, kind: 'bank', amount: -amount, floor: 0 }, { account: 'sys:vehicle', kind: 'system', amount }];
    tx(() => { ledger.post('vehicle', lines, { ref: id, memo: `Licence renewal ${plate}` }); run("INSERT INTO vehicle_renewals(id,merchant_id,account_id,plate,amount,delivery,status,created_at) VALUES(?,?,?,?,?,?,'processing',?)", id, m.id, acct.id, plate, amount, delivery, now()); });
    try { const r = await vehicle.renew({ plate, delivery }); run("UPDATE vehicle_renewals SET status=?,reference=? WHERE id=?", delivery ? 'dispatched' : 'completed', r.reference, id); }
    catch { tx(() => { ledger.post('vehicle_reversal', ledger.reverse(lines), { ref: id }); run("UPDATE vehicle_renewals SET status='failed' WHERE id=?", id); }); throw new ApiError(502, 'provider_error', 'The renewal could not be completed. You were not charged.'); }
    return get('SELECT * FROM vehicle_renewals WHERE id=?', id);
  }
  const vehicleList = (m) => ({ data: all('SELECT * FROM vehicle_renewals WHERE merchant_id=? ORDER BY created_at DESC LIMIT 50', m.id) });

  return { earn, rewardsSummary, redeem, createTicket, listTickets, getTicket, reply, closeTicket, adminTickets, adminReply, reportFraud, faqs, locations,
    startBuyerVerify, confirmBuyerVerify, buyerStatus, buyerPurchases, buyerSubs, buyerSetSub, buyerCards, buyerRemoveCard, vehicleLookup, vehicleRenew, vehicleList };
};
