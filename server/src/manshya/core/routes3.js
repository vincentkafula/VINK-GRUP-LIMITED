const express = require('express');
const crypto = require('crypto');
const { ApiError } = require('./util');

// Phase-3 routes: back office, statements, instant and international payments, cards, rewards, support, buyer account, vehicle.
module.exports = function buildRoutes3({ admin, statements, p2, cards, extras, banking, credit, insurance, account, rails, config, core }) {
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // Raw-body routes (signature checked): money arriving from other banks.
  function mountRaw(r, { limiter, ipKey }) {
    r.post('/rails/inbound', limiter(600, 60000, ipKey), express.raw({ type: '*/*', limit: '100kb' }), wrap((req, res) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : req.rawBody;
      if (!Buffer.isBuffer(raw)) throw new ApiError(500, 'raw_body_missing', 'Raw request body unavailable; see README');
      let evt;
      try { evt = rails.verifyInbound(raw, req.headers); } catch { throw new ApiError(401, 'bad_signature', 'Invalid signature'); }
      res.json(p2.receiveInbound(evt));
    }));
  }

  function mountPublic(r, { limiter, ipKey }) {
    r.post('/public/onboarding/apply', limiter(5, 3600000, ipKey), wrap(async (req, res) => res.status(201).json(await admin.apply(req.body))));
    r.get('/public/statements/verify', limiter(60, 60000, ipKey), wrap((req, res) => res.json(statements.verify(req.query.id, req.query.sig))));
    // The ATM or retailer network calls this. It needs the network key (open only in test mode).
    r.post('/rails/cash/collect', limiter(60, 60000, ipKey), wrap((req, res) => {
      const given = Buffer.from(String(req.get('x-network-key') || '')), want = Buffer.from(String(config.cash.networkKey || ''));
      const ok = config.mode === 'test' || (want.length > 0 && given.length === want.length && crypto.timingSafeEqual(given, want));
      if (!ok) throw new ApiError(401, 'unauthorized', 'Network key required');
      res.json(p2.cashCollect(req.body));
    }));
  }

  function mountAdmin(r, { limiter, ipKey }) {
    const ar = express.Router();
    ar.use(wrap(async (req, res, next) => { const p = await admin.authenticate(req); if (!p) throw new ApiError(401, 'unauthorized', 'Admin credentials required'); req.admin = p; next(); }));
    ar.use(limiter(600, 60000, (req) => 'adm:' + req.admin.actor));
    const w = wrap, A = (req) => req.admin.actor;
    // Back-office roles: superadmin can do everything, compliance handles risk decisions, support answers customers.
    const role = (...rs) => (req, res, next) => (req.admin.role === 'superadmin' || rs.includes(req.admin.role) ? next() : next(new ApiError(403, 'forbidden', `This needs the ${rs[0]} role`)));
    const comp = role('compliance'), sup = role('support'), root = role('superadmin');
    ar.get('/overview', w((req, res) => res.json(admin.overview())));
    ar.get('/merchants', w((req, res) => res.json(admin.listMerchants(req.query))));
    ar.get('/merchants/:id', w((req, res) => res.json(admin.getMerchant(req.params.id))));
    ar.post('/merchants/:id/status', comp, w((req, res) => res.json(admin.setStatus(req.params.id, req.body.status, req.body.reason, A(req)))));
    ar.get('/kyc', w((req, res) => res.json(admin.kycQueue())));
    ar.post('/documents/:id/review', comp, w((req, res) => res.json(admin.review(req.params.id, req.body.status, req.body.note, A(req)))));
    ar.get('/transactions', w((req, res) => res.json(admin.listTransactions(req.query))));
    ar.get('/fraud-flags', w((req, res) => res.json(admin.listFlags(req.query.status))));
    ar.post('/fraud-flags/:id/resolve', comp, w((req, res) => res.json(admin.resolveFlag(req.params.id, req.body.outcome, A(req)))));
    ar.get('/disputes', w((req, res) => res.json(admin.listDisputes(null, req.query.status))));
    ar.post('/disputes', comp, w((req, res) => res.status(201).json(admin.openDispute(req.body, A(req)))));
    ar.post('/disputes/:id/resolve', comp, w((req, res) => res.json(admin.resolveDispute(req.params.id, req.body.outcome, A(req)))));
    ar.get('/applications', w((req, res) => res.json(admin.listApplications(req.query.status))));
    ar.post('/applications/:id/decide', comp, w((req, res) => res.json(admin.decide(req.params.id, req.body.decision, req.body.note, A(req), req.body.override === true))));
    ar.get('/audit', w((req, res) => res.json(admin.auditFeed(req.query))));
    ar.get('/support', w((req, res) => res.json(extras.adminTickets(req.query.status))));
    ar.post('/support/:id/reply', sup, w((req, res) => res.json(extras.adminReply(req.params.id, req.body.message))));
    ar.get('/documents/:id/file', comp, w((req, res) => { const f = account.documentFile(req.params.id); res.set({ 'Content-Type': f.contentType, 'Content-Disposition': `attachment; filename="${f.filename}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }).send(f.buffer); }));
    ar.get('/credit', w((req, res) => res.json(credit.adminList())));
    ar.post('/credit/applications/:id/decide', comp, w((req, res) => res.json(credit.adminDecide(req.params.id, req.body))));
    ar.get('/claims', w((req, res) => res.json(insurance.adminClaims(req.query.status))));
    ar.post('/claims/:id/decide', comp, w((req, res) => res.json(insurance.decide(req.params.id, req.body))));
    ar.post('/keys', root, w((req, res) => { const key = admin.issueAdminKey(req.body.label, req.body.role); res.status(201).json({ key }); }));
    r.use('/admin', ar);
  }

  function mountPrivate(r, { idem, need }) {
    const w = wrap, M = (req) => req.merchant;

    // disputes
    r.get('/disputes', w((req, res) => res.json(admin.listDisputes(M(req).id, req.query.status))));
    r.post('/disputes/:id/evidence', w((req, res) => res.json(admin.addEvidence(M(req), req.params.id, req.body.evidence))));

    // statements
    r.get('/bank/accounts/:id/statement.csv', w((req, res) => res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="statement.csv"', 'Cache-Control': 'no-store' }).send(statements.csv(M(req), req.params.id, req.query))));
    r.get('/bank/accounts/:id/statement.pdf', w(async (req, res) => { const p = await statements.pdf(M(req), req.params.id, req.query); res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="statement.pdf"', 'Cache-Control': 'no-store' }).send(p.buffer); }));
    r.post('/bank/accounts/:id/statement/email', w(async (req, res) => res.json(await statements.email(M(req), req.params.id, req.body.to, req.body.what, { from: req.body.from, to: req.body.periodTo }))));
    r.get('/bank/accounts/:id/share', w((req, res) => res.json(statements.share(M(req), req.params.id))));

    // instant, QR, requests, cash, international
    r.post('/bank/payshap', idem, w(async (req, res) => res.status(201).json(await p2.payshap(M(req), req.body))));
    r.post('/bank/qr', w(async (req, res) => res.status(201).json(await p2.qrCreate(M(req), req.body))));
    r.post('/bank/qr/parse', w((req, res) => res.json(p2.parseQr(req.body.payload))));
    r.post('/bank/qr/pay', idem, w(async (req, res) => res.status(201).json(await p2.qrPay(M(req), req.body))));
    r.get('/bank/requests', w((req, res) => res.json(p2.listRtp(M(req)))));
    r.post('/bank/requests', w((req, res) => res.status(201).json(p2.createRtp(M(req), req.body))));
    r.post('/bank/requests/:id/approve', idem, w(async (req, res) => res.json(await p2.approveRtp(M(req), req.params.id, req.body))));
    r.post('/bank/requests/:id/decline', w((req, res) => res.json(p2.declineRtp(M(req), req.params.id))));
    r.post('/bank/requests/:id/cancel', w((req, res) => res.json(p2.cancelRtp(M(req), req.params.id))));
    r.post('/bank/cash', idem, w(async (req, res) => res.status(201).json(await p2.cashSend(M(req), req.body))));
    r.get('/bank/cash', w((req, res) => res.json(p2.listCash(M(req)))));
    r.post('/bank/cash/:id/cancel', w((req, res) => res.json(p2.cashCancel(M(req), req.params.id))));
    r.post('/bank/fx/quote', w((req, res) => res.status(201).json(p2.fxQuote(M(req), req.body))));
    r.post('/bank/international', idem, w(async (req, res) => res.status(201).json(await p2.sendInternational(M(req), req.body))));
    r.get('/bank/international', w((req, res) => res.json(p2.listInternational(M(req)))));
    r.get('/bank/international/purposes', w((req, res) => res.json({ data: p2.PURPOSES, currencies: Object.keys(config.fx.rates) })));

    // cards
    r.get('/bank/cards', w((req, res) => res.json(cards.list(M(req)))));
    r.post('/bank/cards', w((req, res) => res.status(201).json(cards.order(M(req), req.body))));
    r.get('/bank/cards/transactions', w((req, res) => res.json(cards.transactions(M(req), req.query.cardId))));
    r.patch('/bank/cards/:id', w((req, res) => res.json(cards.update(M(req), req.params.id, req.body))));
    r.post('/bank/cards/:id/activate', w((req, res) => res.json(cards.activate(M(req), req.params.id))));
    r.post('/bank/cards/:id/block', w((req, res) => res.json(cards.block(M(req), req.params.id, req.body.reason))));
    r.post('/bank/cards/:id/wallets', w((req, res) => res.json(cards.wallet(M(req), req.params.id, req.body.wallet, req.body.action))));
    if (config.mode === 'test') r.post('/bank/cards/:id/authorize', w((req, res) => res.json(cards.authorize(M(req), { ...req.body, cardId: req.params.id }))));

    // credit and insurance
    r.get('/credit/products', w((req, res) => res.json({ data: credit.products() })));
    r.post('/credit/apply', w((req, res) => res.status(201).json(credit.apply(M(req), req.body))));
    r.get('/credit/applications', w((req, res) => res.json(credit.listApplications(M(req)))));
    r.post('/credit/applications/:id/accept', idem, w((req, res) => res.status(201).json(credit.accept(M(req), req.params.id))));
    r.post('/credit/applications/:id/decline', w((req, res) => res.json(credit.decline(M(req), req.params.id))));
    r.get('/credit/facilities', w((req, res) => res.json(credit.listFacilities(M(req)))));
    r.get('/credit/facilities/:id', w((req, res) => res.json(credit.statement(M(req), req.params.id))));
    r.post('/credit/facilities/:id/draw', idem, w((req, res) => res.json(credit.draw(M(req), req.params.id, req.body))));
    r.post('/credit/facilities/:id/repay', idem, w((req, res) => res.json(credit.repay(M(req), req.params.id, req.body))));
    r.get('/insurance/products', w((req, res) => res.json({ data: insurance.products() })));
    r.post('/insurance/quote', w((req, res) => res.json(insurance.quote(req.body))));
    r.post('/insurance/policies', idem, w((req, res) => res.status(201).json(insurance.buy(M(req), req.body))));
    r.get('/insurance/policies', w((req, res) => res.json(insurance.list(M(req)))));
    r.post('/insurance/policies/:id/cancel', w((req, res) => res.json(insurance.cancel(M(req), req.params.id))));
    r.post('/insurance/claims', w((req, res) => res.status(201).json(insurance.claim(M(req), req.body))));
    r.get('/insurance/claims', w((req, res) => res.json(insurance.listClaims(M(req)))));

    // rewards, support, buyer account, vehicle
    r.get('/rewards', w((req, res) => res.json(extras.rewardsSummary(M(req)))));
    r.post('/rewards/redeem', w((req, res) => res.json(extras.redeem(M(req), req.body))));
    r.get('/support/faqs', w((req, res) => res.json(extras.faqs(req.query.q))));
    r.get('/support/locations', w((req, res) => res.json(extras.locations(req.query))));
    r.get('/support/tickets', w((req, res) => res.json(extras.listTickets(M(req)))));
    r.post('/support/tickets', w((req, res) => res.status(201).json(extras.createTicket(M(req), req.body))));
    r.get('/support/tickets/:id', w((req, res) => res.json(extras.getTicket(M(req), req.params.id))));
    r.post('/support/tickets/:id/messages', w((req, res) => res.json(extras.reply(M(req), req.params.id, req.body.message))));
    r.post('/support/tickets/:id/close', w((req, res) => res.json(extras.closeTicket(M(req), req.params.id))));
    r.post('/support/report-fraud', w((req, res) => res.status(201).json(extras.reportFraud(M(req), req.body))));
    r.get('/buyer/status', w((req, res) => res.json(extras.buyerStatus(M(req)))));
    r.post('/buyer/verify/start', w((req, res) => res.json(extras.startBuyerVerify(M(req)))));
    r.post('/buyer/verify/confirm', w((req, res) => res.json(extras.confirmBuyerVerify(M(req), req.body.code))));
    r.get('/buyer/purchases', w((req, res) => res.json(extras.buyerPurchases(M(req)))));
    r.get('/buyer/subscriptions', w((req, res) => res.json(extras.buyerSubs(M(req)))));
    r.patch('/buyer/subscriptions/:id', w((req, res) => res.json(extras.buyerSetSub(M(req), req.params.id, req.body.status))));
    r.get('/buyer/cards', w((req, res) => res.json(extras.buyerCards(M(req)))));
    r.delete('/buyer/cards/:id', w((req, res) => res.json(extras.buyerRemoveCard(M(req), req.params.id))));
    r.post('/vehicle/lookup', w(async (req, res) => res.json(await extras.vehicleLookup(req.body.plate))));
    r.post('/vehicle/renew', idem, w(async (req, res) => res.status(201).json(await extras.vehicleRenew(M(req), req.body))));
    r.get('/vehicle/renewals', w((req, res) => res.json(extras.vehicleList(M(req)))));
  }
  return { mountRaw, mountPublic, mountAdmin, mountPrivate };
};
