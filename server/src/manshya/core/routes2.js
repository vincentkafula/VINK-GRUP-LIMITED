const { ApiError } = require('./util');

// Routes for the phase-2 modules (online extras, account, POS catalogue, banking extras).
module.exports = function buildRoutes2({ core, account, online, catalog, banking, config }) {
  const sendCsv = (res, name, cols, rows) =>
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' }).send(online.toCsv(cols, rows));

  function mountPublic(r, { wrap, limiter, ipKey }) {
    r.get('/public/buttons/:token', limiter(60, 60000, ipKey), wrap((req, res) => res.json(online.getButtonPublic(req.params.token))));
    r.post('/public/buttons/:token/pay', limiter(20, 60000, ipKey), wrap(async (req, res) => res.json(await online.payButton(req.params.token, req.body))));
  }

  function mountPrivate(r, { wrap, idem, need }) {
    const M = (req) => req.merchant, admin = need('admin');
    const w = wrap;

    /* online: history, reports, saved cards, subscriptions, payouts, buttons */
    r.get('/transactions', w((req, res) => {
      const d = online.unified(M(req), req.query);
      if (req.query.format === 'csv') return sendCsv(res, 'transactions.csv', ['created_at', 'type', 'sub', 'label', 'status', 'amount', 'id'], d.data);
      res.json(d);
    }));
    r.get('/reports/fees', w((req, res) => {
      const d = online.feesReport(M(req), req.query);
      if (req.query.format === 'csv') return sendCsv(res, 'fees.csv', ['day', 'channel', 'transactions', 'volume', 'fees'], d.rows);
      res.json(d);
    }));
    r.get('/reports/reconciliation', w((req, res) => {
      const d = online.reconciliation(M(req), req.query);
      if (req.query.format === 'csv') return sendCsv(res, 'reconciliation.csv', ['day', 'count', 'total'], d.days);
      res.json(d);
    }));
    r.post('/reports/reconciliation/import', w((req, res) => res.json(online.importSettlement(M(req), req.body))));
    r.post('/saved-cards', w((req, res) => res.status(201).json(online.saveCard(M(req), req.body))));
    r.get('/saved-cards', w((req, res) => res.json(online.listSavedCards(M(req), req.query))));
    r.delete('/saved-cards/:id', w((req, res) => res.json(online.removeSavedCard(M(req), req.params.id))));
    r.post('/subscriptions', w((req, res) => res.status(201).json(online.createSubscription(M(req), req.body))));
    r.get('/subscriptions', w((req, res) => res.json(online.listSubscriptions(M(req), req.query))));
    r.patch('/subscriptions/:id', w((req, res) => res.json(online.setSubscription(M(req), req.params.id, req.body.status))));
    r.post('/payout-schedules', w((req, res) => res.status(201).json(online.createSchedule(M(req), req.body))));
    r.get('/payout-schedules', w((req, res) => res.json(online.listSchedules(M(req)))));
    r.patch('/payout-schedules/:id', w((req, res) => res.json(online.setSchedule(M(req), req.params.id, req.body.status))));
    r.delete('/payout-schedules/:id', w((req, res) => res.json(online.setSchedule(M(req), req.params.id, 'deleted'))));
    r.post('/payment-buttons', w((req, res) => res.status(201).json(online.createButton(M(req), req.body))));
    r.get('/payment-buttons', w((req, res) => res.json(online.listButtons(M(req)))));
    r.delete('/payment-buttons/:id', w((req, res) => res.json(online.disableButton(M(req), req.params.id))));

    /* settings and account */
    r.get('/settings', w((req, res) => res.json(account.getSettings(M(req)))));
    r.put('/settings', admin, w((req, res) => res.json(account.updateSettings(M(req), req.body))));
    r.get('/account/profile', w((req, res) => res.json(account.getProfile(M(req)))));
    r.put('/account/profile', admin, w((req, res) => res.json(account.updateProfile(M(req), req.body))));
    r.get('/account/ubos', w((req, res) => res.json(account.listUbos(M(req)))));
    r.post('/account/ubos', admin, w((req, res) => res.status(201).json(account.createUbo(M(req), req.body))));
    r.delete('/account/ubos/:id', admin, w((req, res) => res.json(account.deleteUbo(M(req), req.params.id))));
    r.get('/account/documents', w((req, res) => res.json(account.listDocuments(M(req)))));
    r.post('/account/documents/upload', admin, w((req, res) => res.status(201).json(account.addDocumentFile(M(req), req.body))));
    r.post('/account/documents', admin, w((req, res) => res.status(201).json(account.addDocument(M(req), req.body))));
    r.get('/account/users', admin, w((req, res) => res.json(account.listUsers(M(req)))));
    r.post('/account/users', admin, w((req, res) => res.status(201).json(account.inviteUser(M(req), req.body))));
    r.patch('/account/users/:id', admin, w((req, res) => res.json(account.updateUser(M(req), req.params.id, req.body))));
    r.delete('/account/users/:id', admin, w((req, res) => res.json(account.removeUser(M(req), req.params.id))));
    r.get('/account/api-keys', admin, w((req, res) => res.json(account.listKeys(M(req)))));
    r.post('/account/api-keys', admin, w((req, res) => res.status(201).json(account.createKey(M(req), req.body, req.role))));
    r.delete('/account/api-keys/:id', admin, w((req, res) => res.json(account.revokeKey(M(req), req.params.id))));
    r.get('/account/activity', admin, w((req, res) => res.json(account.listAudit(M(req), req.query))));
    r.get('/notifications', w((req, res) => res.json(account.listNotifications(M(req)))));
    r.post('/notifications/read', w((req, res) => res.json(account.markRead(M(req)))));

    /* point of sale catalogue and prepaid */
    r.post('/pos/categories', w((req, res) => res.status(201).json(catalog.createCategory(M(req), req.body))));
    r.get('/pos/categories', w((req, res) => res.json(catalog.listCategories(M(req)))));
    r.delete('/pos/categories/:id', w((req, res) => res.json(catalog.deleteCategory(M(req), req.params.id))));
    r.post('/pos/products', w((req, res) => res.status(201).json(catalog.createProduct(M(req), req.body))));
    r.get('/pos/products', w((req, res) => res.json(catalog.listProducts(M(req)))));
    r.patch('/pos/products/:id', w((req, res) => res.json(catalog.updateProduct(M(req), req.params.id, req.body))));
    r.delete('/pos/products/:id', w((req, res) => res.json(catalog.deleteProduct(M(req), req.params.id))));
    r.post('/pos/staff', admin, w((req, res) => res.status(201).json(catalog.createStaff(M(req), req.body))));
    r.get('/pos/staff', w((req, res) => res.json(catalog.listStaff(M(req)))));
    r.patch('/pos/staff/:id', admin, w((req, res) => res.json(catalog.setStaff(M(req), req.params.id, req.body.status))));
    r.post('/pos/staff/:id/verify-pin', w((req, res) => res.json(catalog.verifyPin(M(req), req.params.id, req.body.pin))));
    r.post('/pos/prepaid', idem, w(async (req, res) => res.status(201).json(await banking.buy(M(req), req.body, 'pos'))));

    /* banking extras */
    r.patch('/bank/accounts/:id', w((req, res) => res.json(banking.renameAccount(M(req), req.params.id, req.body.name))));
    r.patch('/bank/beneficiaries/:id', w((req, res) => res.json(banking.updateBeneficiary(M(req), req.params.id, req.body))));
    r.delete('/bank/beneficiaries/:id', w((req, res) => res.json(banking.deleteBeneficiary(M(req), req.params.id))));
    r.get('/bank/beneficiaries/:id/history', w((req, res) => res.json(banking.beneficiaryHistory(M(req), req.params.id))));
    r.post('/bank/scheduled-payments', w((req, res) => res.status(201).json(banking.createScheduled(M(req), req.body))));
    r.get('/bank/scheduled-payments', w((req, res) => res.json(banking.listScheduled(M(req)))));
    r.delete('/bank/scheduled-payments/:id', w((req, res) => res.json(banking.cancelScheduled(M(req), req.params.id))));
    r.post('/bank/savings-goals', w((req, res) => res.status(201).json(banking.createGoal(M(req), req.body))));
    r.get('/bank/savings-goals', w((req, res) => res.json(banking.listGoals(M(req)))));
    r.post('/bank/savings-goals/:id/deposit', idem, w((req, res) => res.json(banking.deposit(M(req), req.params.id, req.body))));
    r.post('/bank/savings-goals/:id/withdraw', idem, w((req, res) => res.json(banking.withdraw(M(req), req.params.id, req.body))));
    r.delete('/bank/savings-goals/:id', w((req, res) => res.json(banking.closeGoal(M(req), req.params.id))));
    r.get('/bills/catalogue', w((req, res) => res.json({ data: banking.catalogue() })));
    r.post('/bills/purchase', idem, w(async (req, res) => res.status(201).json(await banking.buy(M(req), req.body, 'bank'))));
    r.get('/bills/purchases', w((req, res) => res.json(banking.listPurchases(M(req), req.query))));
    r.get('/bank/debit-orders', w((req, res) => res.json(banking.listDebitOrders(M(req)))));
    for (const a of ['approve', 'decline', 'stop']) r.post(`/bank/debit-orders/:id/${a}`, w((req, res) => res.json(banking.setDebit(M(req), req.params.id, a))));
    r.post('/bank/debit-orders/:id/dispute', w((req, res) => res.json(banking.disputeDebit(M(req), req.params.id))));
    r.get('/bank/insights', w((req, res) => res.json(banking.insights(M(req), req.query.month))));
    if (config.mode === 'test') {   // sandbox helpers: stand in for a creditor's bank
      r.post('/bank/debit-orders/simulate', w((req, res) => {
        const a = core.getAccount(M(req).id, req.body.accountId);
        res.status(201).json(banking.createMandate({ ...req.body, accountNumber: a.number }));
      }));
      r.post('/bank/debit-orders/:id/simulate-collect', w((req, res) => {
        if (!banking.listDebitOrders(M(req)).data.some((d) => d.id === req.params.id)) throw new ApiError(404, 'debit_order_not_found', 'debit order not found');
        res.json(banking.collectDebit(req.params.id));
      }));
    }
  }
  return { mountPublic, mountPrivate };
};
