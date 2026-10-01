const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { ApiError, rid, now, sha256 } = require('./util');

// Statements: CSV, electronically stamped PDF, stamp verification, email and shareable account details.
module.exports = function buildStatements({ db, core, config, online, mail }) {
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const secret = () => {
    let r = get("SELECT value FROM kv WHERE key='stamp_secret'");
    if (!r) { db.prepare("INSERT OR IGNORE INTO kv(key,value) VALUES('stamp_secret',?)").run(crypto.randomBytes(32).toString('hex')); r = get("SELECT value FROM kv WHERE key='stamp_secret'"); }
    return r.value;
  };
  const sign = (id, hash) => crypto.createHmac('sha256', secret()).update(`${id}.${hash}`).digest('hex').slice(0, 32);
  const R = (c) => (c < 0 ? '-' : '') + 'R ' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function load(m, accountId, q = {}) {
    const acct = core.getAccount(m.id, accountId);
    const rows = core.statement(m, accountId, { from: q.from, to: q.to, limit: 500 }).data.reverse();
    const opening = rows.length ? rows[0].balance - rows[0].amount : acct.balance;
    return { acct, rows, opening, closing: rows.length ? rows[rows.length - 1].balance : acct.balance, period: `${q.from || 'start'} to ${q.to || 'today'}` };
  }
  const csv = (m, accountId, q) => online.toCsv(['date', 'description', 'amount', 'balance'], load(m, accountId, q).rows.map((r) => ({ date: r.date, description: r.memo || r.kind, amount: r.amount, balance: r.balance })));

  async function pdf(m, accountId, q = {}) {
    const s = load(m, accountId, q);
    const hash = sha256(JSON.stringify({ n: s.acct.number, p: s.period, r: s.rows.map((r) => [r.date, r.amount, r.balance]) }));
    const id = rid('stm'), sig = sign(id, hash);
    db.prepare('INSERT INTO statement_stamps(id,merchant_id,account_id,hash,period,created_at) VALUES(?,?,?,?,?,?)').run(id, m.id, accountId, hash, s.period, now());
    const doc = new PDFDocument({ margin: 48, size: 'A4', info: { Title: 'Account statement', Author: config.bankName } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise((ok) => doc.on('end', () => ok(Buffer.concat(chunks))));
    doc.fontSize(20).text(config.bankName).fontSize(11).fillColor('#555').text('Account statement').moveDown();
    doc.fillColor('#000').fontSize(10).text(`Account holder: ${m.name}`).text(`Account: ${s.acct.name} (${s.acct.number})`).text(`Branch code: ${config.branchCode}`).text(`Period: ${s.period}`)
      .text(`Opening balance: ${R(s.opening)}    Closing balance: ${R(s.closing)}`).moveDown();
    const row = (a, b, c, d, bold) => { const y = doc.y; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9); doc.text(a, 48, y, { width: 100 }); doc.text(b, 150, y, { width: 220 }); doc.text(c, 370, y, { width: 80, align: 'right' }); doc.text(d, 455, y, { width: 90, align: 'right' }); doc.moveDown(0.4); };
    row('Date', 'Description', 'Amount', 'Balance', true);
    for (const r of s.rows) { if (doc.y > 740) doc.addPage(); row(r.date.slice(0, 16).replace('T', ' '), String(r.memo || r.kind).slice(0, 44), R(r.amount), R(r.balance)); }
    if (!s.rows.length) doc.font('Helvetica').fontSize(9).text('No transactions in this period.');
    doc.moveDown(2).font('Helvetica').fontSize(8).fillColor('#555')
      .text(`Electronically stamped. Statement ${id}, generated ${now()}.`).text(`Content hash ${hash}`).text(`Stamp ${sig}`)
      .text(`Verify at ${(config.publicUrl || '')}/api/public/statements/verify?id=${id}&sig=${sig}`);
    doc.end();
    return { buffer: await done, id };
  }
  function verify(id, sigIn) {
    const row = get('SELECT s.*,a.number FROM statement_stamps s JOIN bank_accounts a ON a.id=s.account_id WHERE s.id=?', String(id));
    if (!row) return { valid: false };
    const want = Buffer.from(sign(row.id, row.hash)), got = Buffer.from(String(sigIn || ''));
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return { valid: false };
    return { valid: true, account: '••••' + row.number.slice(-4), period: row.period, issued: row.created_at };
  }
  const share = (m, accountId) => {
    const a = core.getAccount(m.id, accountId);
    const lines = [`Account holder: ${m.name}`, `Bank: ${config.bankName}`, `Account type: ${a.kind}`, `Account number: ${a.number}`, `Branch code: ${config.branchCode}`, `SWIFT: ${config.swift}`];
    return { text: lines.join('\n'), fields: { holder: m.name, bank: config.bankName, type: a.kind, number: a.number, branch_code: config.branchCode, swift: config.swift } };
  };
  async function email(m, accountId, to, what, q) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to || '')) throw new ApiError(400, 'invalid_email', 'to must be a valid email address');
    if (what === 'details') { mail(m.id, to, `${m.name}: account details`, share(m, accountId).text); return { sent: true }; }
    const p = await pdf(m, accountId, q);
    mail(m.id, to, `${m.name}: your account statement`, 'Your stamped statement is attached.', [{ filename: 'statement.pdf', content: p.buffer }]);
    return { sent: true, statement_id: p.id };
  }
  return { csv, pdf, verify, share, email };
};
