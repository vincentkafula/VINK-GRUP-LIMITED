import { Router, json, type Request, type Response } from "express";
import { h, uid, actor, fail, isUuid, audit, sendCsv, type Db } from "./common.js";
import { createFinance } from "../services/finance.js";
import { createOwnerAssociation } from "../services/ownerAssociation.js";

/**
 * The association's finance API (docs/ASSOCIATION_COMPLIANCE.md, module 7), mounted on the association router, so everything is scoped to the signed-in association by construction: no route takes an association id.
 *   /finance/summary, /settings        the overview with its flags, and the approval threshold
 *   /finance/fees, /charges            the approved fee schedule, and charging members from it
 *   /finance/members(/:id/statement)   each member's account, and a statement to hand them
 *   /finance/receipts(/:id.pdf, /void) numbered receipts, never deleted
 *   /finance/expenses                  recorded, then approved by named office bearers
 *   /finance/deposits, /cash           banking
 *   /finance/budgets, /statement(.csv) budgets, and income and expenses by month or year
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function mountAssociationFinance(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const fin = createFinance(db, now), owned = createOwnerAssociation(db, now), body = json({ limit: "20kb" }), id = (req: Request) => String(req.params.id), bad = (res: Response) => fail(res, 400, "Invalid id");
  const day = (req: Request, k: string) => (typeof req.query[k] === "string" && DAY.test(String(req.query[k])) ? String(req.query[k]) : undefined);

  router.get("/finance/summary", h(async (req, res) => { res.json({ success: true, ...(await fin.summary(uid(req), day(req, "on"))) }); }));
  router.get("/finance/settings", h(async (req, res) => { res.json({ success: true, ...(await fin.settings(uid(req))) }); }));
  router.put("/finance/settings", body, h(async (req, res) => { const r = await fin.saveSettings(uid(req), actor(req), req.body ?? {}); if (r.ok) await audit(db, req, "finance.settings", null, { threshold: req.body?.approvalThresholdCents, requireSignedInApprovals: req.body?.requireSignedInApprovals }); reply(res, r); }));

  router.get("/finance/fees", h(async (req, res) => { res.json({ success: true, fees: await fin.fees(uid(req)) }); }));
  router.post("/finance/fees", body, h(async (req, res) => { const r = await fin.addFee(uid(req), actor(req), req.body ?? {}); if (r.ok) await audit(db, req, "finance.fee", r.value.id, { kind: req.body?.kind, amountCents: req.body?.amountCents }); reply(res, r, 201); }));
  router.post("/finance/fees/:id/active", body, h(async (req, res) => { if (!isUuid(id(req)) || typeof req.body?.active !== "boolean") { bad(res); return; } reply(res, await fin.setFeeActive(uid(req), actor(req), id(req), req.body.active)); }));
  router.post("/finance/charges", body, h(async (req, res) => { const r = await fin.charge(uid(req), actor(req), req.body ?? {}); if (r.ok) await audit(db, req, "finance.charge", String(req.body?.feeId), { created: r.value.created }); reply(res, r, 201); }));

  router.get("/finance/members", h(async (req, res) => { res.json({ success: true, members: await fin.memberLedger(uid(req), day(req, "on")) }); }));
  router.get("/finance/members/:id/statement", h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await fin.memberStatement(uid(req), id(req))); }));

  router.get("/finance/receipts", h(async (req, res) => { const m = typeof req.query.memberId === "string" && isUuid(req.query.memberId) ? req.query.memberId : undefined, from = day(req, "from"), to = day(req, "to"); res.json({ success: true, receipts: await fin.receipts(uid(req), { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(m ? { memberId: m } : {}) }) }); }));
  router.post("/finance/receipts", body, h(async (req, res) => { const r = await fin.recordReceipt(uid(req), actor(req), req.body ?? {}); if (r.ok) await audit(db, req, "finance.receipt", r.value.id, { number: r.value.number, amountCents: req.body?.amountCents, method: req.body?.method }); reply(res, r, 201); }));
  router.get("/finance/receipts/:id.pdf", h(async (req, res) => {
    if (!isUuid(id(req))) { bad(res); return; } const r = await fin.receiptPdf(uid(req), id(req)); if (!r.ok) { fail(res, r.status, r.error); return; }
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="receipt-${id(req).slice(0, 8)}.pdf"`); res.send(r.value);
  }));
  router.post("/finance/receipts/:id/void", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await fin.voidReceipt(uid(req), actor(req), id(req), req.body?.reason); if (r.ok) await audit(db, req, "finance.receipt.void", id(req), { reason: req.body?.reason }); reply(res, r); }));

  // What members say they have paid and the association has not yet checked against its own bank. Confirming issues the numbered receipt; rejecting needs a reason.
  router.get("/finance/claims", h(async (req, res) => { res.json({ success: true, claims: await owned.pending(uid(req)) }); }));
  router.post("/finance/claims/:id/confirm", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await owned.confirm(uid(req), actor(req), id(req), req.body ?? {}); if (r.ok) await audit(db, req, "finance.claim.confirm", id(req), { receiptId: r.value.receiptId }); reply(res, r); }));
  router.post("/finance/claims/:id/reject", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await owned.reject(uid(req), actor(req), id(req), req.body?.reason); if (r.ok) await audit(db, req, "finance.claim.reject", id(req), { reason: req.body?.reason }); reply(res, r); }));

  router.get("/finance/expenses", h(async (req, res) => { res.json({ success: true, expenses: await fin.expenses(uid(req), typeof req.query.status === "string" ? req.query.status : undefined) }); }));
  router.post("/finance/expenses", body, h(async (req, res) => { const r = await fin.addExpense(uid(req), actor(req), req.body ?? {}); if (r.ok) await audit(db, req, "finance.expense", r.value.id, { amountCents: req.body?.amountCents }); reply(res, r, 201); }));
  router.post("/finance/expenses/:id/approve", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } let bearer: unknown = req.body?.officeBearerId, signedIn = false;
    if (req.delegateRole) { if (!req.delegateBearerId) { fail(res, 403, "Your login is not linked to an office bearer, so you cannot approve: ask the association to link it"); return; } bearer = req.delegateBearerId; signedIn = true; }             // a named office bearer approves as themselves, whatever they send
    const r = await fin.approveExpense(uid(req), actor(req), id(req), bearer, { signedIn }); if (r.ok) await audit(db, req, "finance.expense.approve", id(req), { officeBearerId: bearer, signedIn }); reply(res, r); }));
  router.post("/finance/expenses/:id/reject", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await fin.rejectExpense(uid(req), actor(req), id(req), req.body?.reason)); }));

  router.get("/finance/deposits", h(async (req, res) => { res.json({ success: true, deposits: await fin.deposits(uid(req)) }); }));
  router.post("/finance/deposits", body, h(async (req, res) => { reply(res, await fin.addDeposit(uid(req), actor(req), req.body ?? {}), 201); }));
  router.get("/finance/cash", h(async (req, res) => { res.json({ success: true, ...(await fin.cash(uid(req), day(req, "on"))) }); }));

  router.get("/finance/budgets", h(async (req, res) => { const y = Number(req.query.year) || Number(new Date(now()).getUTCFullYear()); res.json({ success: true, year: y, budgets: await fin.budgets(uid(req), y) }); }));
  router.put("/finance/budgets", body, h(async (req, res) => { reply(res, await fin.setBudget(uid(req), actor(req), req.body ?? {})); }));
  const period = (req: Request) => ({ ...(typeof req.query.month === "string" ? { month: req.query.month } : {}), ...(Number.isInteger(Number(req.query.year)) && req.query.year ? { year: Number(req.query.year) } : {}) });
  router.get("/finance/statement", h(async (req, res) => { reply(res, await fin.statement(uid(req), period(req))); }));
  router.get("/finance/statement.csv", h(async (req, res) => {
    const r = await fin.statement(uid(req), period(req)); if (!r.ok) { fail(res, r.status, r.error); return; } const v = r.value as { period: string; income: { category: string; amountCents: number }[]; expenses: { category: string; amountCents: number }[]; incomeCents: number; expensesCents: number; netCents: number };
    const rand = (c: number) => (c / 100).toFixed(2); sendCsv(res, `income-statement-${v.period}.csv`, ["Section", "Category", "Amount (R)"], [...v.income.map((x) => ["Income", x.category, rand(x.amountCents)]), ["Income", "Total income", rand(v.incomeCents)], ...v.expenses.map((x) => ["Expenses", x.category, rand(x.amountCents)]), ["Expenses", "Total expenses", rand(v.expensesCents)], ["Net", "Income less expenses", rand(v.netCents)]]);
  }));
}
