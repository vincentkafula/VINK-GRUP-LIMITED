/**
 * Reconciliation of every kind of money movement against its own records.
 *
 * reconcile.js already proves that the ledger as a whole balances and that payments, refunds, payouts and transfers match what was posted. Every OTHER thing that moves money
 * (bill payments, cash sends, international payments, vehicle renewals, card purchases, inbound bank credits, disputes and chargebacks, insurance premiums and claims, credit)
 * posts to the same ledger but used to have no check at all: a record with no posting, a posting with no record, or an amount that differs would reconcile as "clean".
 *
 * For each, the same three questions:
 *   1. Is there a posting for every record that should have one, for the amount on the record?
 *   2. Is every reversal matched by a record that failed, and every failed record matched by a reversal?
 *   3. Is there a posting that points at a record that does not exist (an orphan)?
 * and, for the two system accounts that hold money on someone's behalf (cash waiting to be collected, money held in disputes), whether the account holds exactly what the
 * open records say it should.
 *
 * Every kind of posting the engine makes is listed in COVERED below. A test reads the engine's source and fails if a new kind of posting appears that is not listed, so a
 * new way of moving money cannot be added without deciding how it is reconciled.
 */

/** Every kind of ledger posting the engine makes, and how it is reconciled. `books` = reconciled here, `core` = reconcile.js, `none` = has no record to compare against (with why). */
const COVERED = {
  payment: 'core', refund: 'core', refund_reversal: 'core', payout: 'core', transfer: 'core', reversal: 'core',
  bill: 'books', bill_reversal: 'books', cash_send: 'books', cash_collect: 'books', cash_refund: 'books', inbound: 'books', international: 'books', international_reversal: 'books',
  vehicle: 'books', vehicle_reversal: 'books', card: 'books', card_reversal: 'books', dispute_hold: 'books', dispute_release: 'books', chargeback: 'books', chargeback_fee: 'books',
  premium: 'books', claim: 'books', credit_draw: 'books', credit_repay: 'books', credit_interest: 'books',
  goal: 'orphans', interest: 'orphans', debit_order: 'orphans',
  deposit: 'none',        // seed and test funding: there is no business record behind it
  reward: 'none', reward_redeem: 'none',   // posted against the rewards account with no reference; the rewards table is a log, not a source of truth
};

function buildBooksChecks({ db }) {
  const all = (sql, ...p) => db.prepare(sql).all(...p), get = (sql, ...p) => db.prepare(sql).get(...p);
  const qs = (a) => a.map(() => '?').join(',');
  /** For each reference: the money that moved in journals of these kinds (the sum of their positive lines) and how many journals there were. */
  const moved = (kinds) => new Map(all(`SELECT j.ref ref, SUM(CASE WHEN e.amount>0 THEN e.amount ELSE 0 END) v, COUNT(DISTINCT j.id) n FROM journals j JOIN entries e ON e.journal_id=j.id WHERE j.kind IN (${qs(kinds)}) AND j.ref IS NOT NULL GROUP BY j.ref`, ...kinds).map((r) => [String(r.ref), { v: r.v, n: r.n }]));
  const balance = (account) => get('SELECT COALESCE(SUM(amount),0) b FROM entries WHERE account_id=?', account).b;
  const cents = (n) => `${n} cents`;

  return function check(add) {
    /** Postings that point at a record that is not on file. */
    const orphans = (label, kinds, ids) => { for (const ref of moved(kinds).keys()) if (!ids.has(ref)) add(`${label}_orphan_journal`, ref, `A ${label.replace(/_/g, ' ')} posting exists for a record that is not on file`); };

    /** A record that posts once and may be reversed if it fails. */
    function postedOnce(label, noun, { table, id = 'id', amount = 'amount', post, reverse = [], failed }) {
      const rows = all(`SELECT ${id} id, merchant_id, (${amount}) amount, ${failed ? `(${failed})` : '0'} failed FROM ${table}`);
      const p = moved(post), r = reverse.length ? moved(reverse) : new Map(), ids = new Set(rows.map((x) => String(x.id)));
      for (const x of rows) {
        const got = p.get(String(x.id)), back = r.get(String(x.id));
        if (!got) { add(`${label}_not_posted`, x.id, `${noun} of ${cents(x.amount)} is on record but was never posted to the books`, x.merchant_id); continue; }
        if (got.v !== x.amount) add(`${label}_amount_mismatch`, x.id, `${noun} is ${cents(x.amount)} on record but ${cents(got.v)} was posted`, x.merchant_id);
        if (x.failed) { if (!back || back.v !== got.v) add(`${label}_reversal_missing`, x.id, `${noun} failed but the ${cents(got.v)} taken was ${back ? `only ${cents(back.v)} ` : 'not '}returned`, x.merchant_id); }
        else if (back) add(`${label}_reversed_but_not_failed`, x.id, `${noun} was reversed but is not marked failed`, x.merchant_id);
      }
      orphans(label, [...post, ...reverse], ids);
    }

    postedOnce('bill', 'Bill payment', { table: 'bill_purchases', post: ['bill'], reverse: ['bill_reversal'], failed: "status='failed'" });
    postedOnce('international', 'International payment', { table: 'international_payments', amount: 'zar_amount + fee', post: ['international'], reverse: ['international_reversal'], failed: "status='failed'" });
    postedOnce('vehicle', 'Vehicle licence renewal', { table: 'vehicle_renewals', post: ['vehicle'], reverse: ['vehicle_reversal'], failed: "status='failed'" });
    postedOnce('inbound', 'Inbound bank credit', { table: 'inbound_credits', id: 'rail_ref', post: ['inbound'] });

    // Card purchases: an approved one moved its amount, a declined one moved nothing, and whatever the processor later reversed was returned, no more and no less.
    {
      const p = moved(['card']), back = moved(['card_reversal']), rows = all('SELECT id, merchant_id, amount, reversed, status FROM card_transactions'), ids = new Set(rows.map((x) => String(x.id)));
      for (const x of rows) {
        const got = p.get(String(x.id)), returned = back.get(String(x.id))?.v ?? 0;
        if (x.status === 'approved' || x.status === 'reversed') {
          if (!got) add('card_not_posted', x.id, `Card purchase of ${cents(x.amount)} was approved but never posted to the books`, x.merchant_id);
          else if (got.v !== x.amount) add('card_amount_mismatch', x.id, `Card purchase is ${cents(x.amount)} on record but ${cents(got.v)} was posted`, x.merchant_id);
        } else if (got) add('card_declined_but_posted', x.id, `A card purchase was declined but ${cents(got.v)} was posted for it`, x.merchant_id);
        if (returned !== x.reversed) add('card_reversal_mismatch', x.id, `${cents(x.reversed)} is recorded as reversed but ${cents(returned)} was returned to the account`, x.merchant_id);
        if (x.reversed > x.amount) add('card_over_reversed', x.id, `${cents(x.reversed)} was reversed on a purchase of ${cents(x.amount)}`, x.merchant_id);
        if ((x.status === 'reversed') !== (x.reversed >= x.amount && x.amount > 0)) add('card_status_mismatch', x.id, `Card purchase is ${x.status} but ${cents(x.reversed)} of ${cents(x.amount)} was reversed`, x.merchant_id);
      }
      orphans('card', ['card', 'card_reversal'], ids);
    }

    // Cash waiting at a retailer or ATM: money leaves the account into escrow, then either goes out (collected) or comes back (cancelled or expired).
    {
      const sent = moved(['cash_send']), collected = moved(['cash_collect']), returned = moved(['cash_refund']);
      const rows = all('SELECT id, merchant_id, amount, status FROM cash_vouchers'), ids = new Set(rows.map((x) => String(x.id)));
      for (const v of rows) {
        const s = sent.get(String(v.id)), c = collected.get(String(v.id)), r = returned.get(String(v.id));
        if (!s) add('cash_not_posted', v.id, `Cash for collection (${cents(v.amount)}) is on record but was never posted to the books`, v.merchant_id);
        else if (s.v !== v.amount) add('cash_amount_mismatch', v.id, `Cash is ${cents(v.amount)} on record but ${cents(s.v)} was posted`, v.merchant_id);
        if (v.status === 'collected') { if (!c || c.v !== v.amount) add('cash_collect_missing', v.id, `Cash was collected but the ${cents(v.amount)} paid out is ${c ? `${cents(c.v)}` : 'not posted'}`, v.merchant_id); if (r) add('cash_settled_twice', v.id, 'Cash was collected and also returned to the sender', v.merchant_id); }
        else if (v.status === 'active') { if (c || r) add('cash_settled_but_active', v.id, 'Cash is still waiting for collection but has already been paid out or returned', v.merchant_id); }
        else { if (!r || r.v !== v.amount) add('cash_refund_missing', v.id, `Cash is ${v.status} but the ${cents(v.amount)} was ${r ? `only ${cents(r.v)} ` : 'not '}returned to the sender`, v.merchant_id); if (c) add('cash_settled_twice', v.id, `Cash is ${v.status} but was also collected`, v.merchant_id); }
      }
      orphans('cash', ['cash_send', 'cash_collect', 'cash_refund'], ids);
      const waiting = get("SELECT COALESCE(SUM(amount),0) s FROM cash_vouchers WHERE status='active'").s, held = balance('sys:cash_escrow');
      if (held !== waiting) add('cash_escrow_mismatch', null, `The cash escrow account holds ${cents(held)} but the vouchers still waiting add up to ${cents(waiting)}`);
    }

    // Disputes: the amount is held when the dispute opens; it is then released to the merchant (won) or charged back with a fee (lost).
    {
      const hold = moved(['dispute_hold']), release = moved(['dispute_release']), back = moved(['chargeback']), fee = moved(['chargeback_fee']);
      const rows = all('SELECT id, merchant_id, amount, status FROM disputes'), ids = new Set(rows.map((x) => String(x.id)));
      for (const d of rows) {
        const h = hold.get(String(d.id)), rel = release.get(String(d.id)), cb = back.get(String(d.id)), f = fee.get(String(d.id));
        if (!h || h.v !== d.amount) add('dispute_hold_mismatch', d.id, `Dispute of ${cents(d.amount)}: ${h ? `${cents(h.v)} was held` : 'nothing was held'}`, d.merchant_id);
        if (d.status === 'open' && (rel || cb || f)) add('dispute_settled_but_open', d.id, 'Dispute is still open but the held money has already been released or charged back', d.merchant_id);
        if (d.status === 'won' && (!rel || rel.v !== d.amount || cb)) add('dispute_release_mismatch', d.id, `Dispute was won but ${rel ? `${cents(rel.v)} was released` : 'nothing was released'}${cb ? ' and it was also charged back' : ''}`, d.merchant_id);
        if (d.status === 'lost' && (!cb || cb.v !== d.amount || rel)) add('dispute_chargeback_mismatch', d.id, `Dispute was lost but ${cb ? `${cents(cb.v)} was charged back` : 'no chargeback was posted'}${rel ? ' and the money was also released' : ''}`, d.merchant_id);
        if (d.status === 'lost' && !f) add('dispute_fee_missing', d.id, 'Dispute was lost but the chargeback fee was not charged', d.merchant_id);
      }
      orphans('dispute', ['dispute_hold', 'dispute_release', 'chargeback', 'chargeback_fee'], ids);
      const open = get("SELECT COALESCE(SUM(amount),0) s FROM disputes WHERE status='open'").s, held = balance('sys:disputes');
      if (held !== open) add('disputes_account_mismatch', null, `The disputes account holds ${cents(held)} but open disputes add up to ${cents(open)}`);
    }

    // Insurance: a policy is paid for when it is bought (and every month after), and a paid claim moved exactly what it says.
    {
      const premiums = moved(['premium']), policies = all('SELECT id, merchant_id, premium FROM policies'), ids = new Set(policies.map((x) => String(x.id)));
      for (const p of policies) if (!premiums.has(String(p.id))) add('policy_premium_not_posted', p.id, `A policy of ${cents(p.premium)} a month is on record but no premium was ever posted`, p.merchant_id);
      orphans('policy', ['premium'], ids);
      const paid = moved(['claim']), claims = all('SELECT id, merchant_id, status, paid FROM claims'), cids = new Set(claims.map((x) => String(x.id)));
      for (const c of claims) {
        const got = paid.get(String(c.id));
        if (c.status === 'paid') { if (!got || got.v !== c.paid) add('claim_payout_mismatch', c.id, `Claim is marked paid ${cents(c.paid ?? 0)} but ${got ? cents(got.v) : 'nothing'} was posted`, c.merchant_id); }
        else if (got) add('claim_paid_but_not_marked', c.id, `A claim that is ${c.status} has ${cents(got.v)} posted as paid`, c.merchant_id);
      }
      orphans('claim', ['claim'], cids);
      for (const r of all("SELECT p.id, p.merchant_id, p.cover, COALESCE(SUM(c.paid),0) s FROM policies p JOIN claims c ON c.policy_id=p.id AND c.status='paid' GROUP BY p.id HAVING s > p.cover"))
        add('claims_exceed_cover', r.id, `Claims paid on one policy add up to ${cents(r.s)} but the cover is ${cents(r.cover)}`, r.merchant_id);
    }

    // Credit: a term loan is paid out once when accepted, and everything posted points at a facility that exists.
    {
      const draws = moved(['credit_draw']), facilities = all('SELECT id, merchant_id, limit_amount, term_months FROM credit_facilities'), ids = new Set(facilities.map((x) => String(x.id)));
      for (const f of facilities) if (f.term_months) { const d = draws.get(String(f.id)); if (!d || d.v < f.limit_amount) add('loan_payout_missing', f.id, `Loan of ${cents(f.limit_amount)} was accepted but ${d ? cents(d.v) : 'nothing'} was paid out`, f.merchant_id); }
      orphans('credit', ['credit_draw', 'credit_repay', 'credit_interest'], ids);
    }

    // Card machine money goes straight into a VINK bank account, and the payment records which one (a refund or a dispute takes the money back from there). So what the payment says and what was
    // posted must agree, both ways: a payment that names an account must have put its money there, and money put in a bank account by a payment must be named.
    for (const p of all('SELECT id, merchant_id, settled_to FROM payments WHERE settled_to IS NOT NULL')) {
      const put = get("SELECT COALESCE(SUM(e.amount),0) s FROM entries e JOIN journals j ON j.id=e.journal_id WHERE j.kind='payment' AND j.ref=? AND e.account_id=?", p.id, `bank:${p.settled_to}`).s;
      if (put <= 0) add('payment_settlement_mismatch', p.id, `Payment says its money went to bank account ${p.settled_to}, but nothing was posted there`, p.merchant_id);
    }
    for (const r of all("SELECT DISTINCT j.ref ref, p.merchant_id merchant FROM journals j JOIN entries e ON e.journal_id=j.id AND e.account_id LIKE 'bank:%' AND e.amount>0 JOIN payments p ON p.id=j.ref WHERE j.kind='payment' AND p.settled_to IS NULL"))
      add('payment_settlement_mismatch', r.ref, 'A payment put money into a bank account but does not say where it went, so a refund would look in the wrong place', r.merchant);

    // Savings and debit orders have no balance of their own on record, but nothing may be posted for one that does not exist.
    orphans('savings', ['goal', 'interest'], new Set(all('SELECT id FROM savings_goals').map((x) => String(x.id))));
    orphans('debit_order', ['debit_order'], new Set(all('SELECT id FROM debit_orders').map((x) => String(x.id))));
  };
}

module.exports = { buildBooksChecks, COVERED };
