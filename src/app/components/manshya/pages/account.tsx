/* eslint-disable @typescript-eslint/no-explicit-any -- rows are untyped JSON from the Manshya API; fields are read directly as in the original dashboard */
import { api, ask, toast, secret, R, dt, enc, accountOptions, table, tag, btn, cards, note, H2, Sw, form, collect, type Page } from "../kit";
import { MANSHYA_BASE } from "../api";
import { toggles, profilePage, checkoutLink } from "./shared";

/* Settings, account and card-machine (point of sale) pages. */

export const account: Record<string, Page> = {};
const P = account;

/* ---------- settings ---------- */
P["s/methods"] = toggles("payment_methods", { card: "Card payments", eft: "Instant EFT", qr: "QR code payments" });
P["s/notif"] = toggles("notifications", { payment_paid: "Payment received", payment_failed: "Payment failed", payout: "Payouts", transfer: "Transfers", email: "Also send by email" });

P["s/billing"] = async () => {
  const s = (await api("/settings")).billing;
  return {
    title: "Payouts and billing", sub: "Details printed on your invoices.",
    actions: [{ label: "Save", p: true, fn: async () => { await api("/settings", { method: "PUT", body: { billing: collect() } }); toast("Saved"); } }],
    content: <>{form([{ name: "invoice_email", label: "Invoice email" }, { name: "vat_number", label: "VAT number" }], s)}{note("Fees: online 2.9% + R1.00 per payment, card machine 2.5%, R8.50 per payout.")}</>,
  };
};

/** Lets the dashboard shell apply the chosen theme right after it is saved. */
export const themeEvents = new EventTarget();

P["s/display"] = async () => {
  const s = await api("/settings");
  const L: Record<string, string> = { show_quick_actions: "Quick actions", show_activity: "Recent activity", show_accounts: "Accounts and savings" };
  return {
    title: "Display settings",
    actions: [{
      label: "Save theme", p: true, fn: async () => {
        const theme = collect().theme;
        await api("/settings", { method: "PUT", body: { display: { theme } } });
        themeEvents.dispatchEvent(new CustomEvent("theme", { detail: theme }));
        toast("Saved");
      },
    }],
    content: (
      <>
        {form([{ name: "theme", label: "Theme", type: "select", options: [["system", "Match my device"], ["light", "Light"], ["dark", "Dark"]] }], s.display)}
        <H2>Banking home screen</H2>
        {Object.entries(L).map(([k, l]) => <Sw key={k} on={!!s.home[k]} d={`hm|${k}|${!s.home[k]}`} label={l} />)}
      </>
    ),
    on: { hm: async (k, v) => { await api("/settings", { method: "PUT", body: { home: { [k]: v === "true" } } }); } },
  };
};

P["s/integration"] = async () => {
  const me = await api("/me");
  const base = MANSHYA_BASE.startsWith("http") ? MANSHYA_BASE : location.origin + MANSHYA_BASE;
  return {
    title: "Integration", sub: "Connect your website or app.",
    content: (
      <>
        {cards([["Merchant ID", <code className="k">{me.id}</code>], ["API base URL", <code className="k">{base}</code>]])}
        <div className="card">
          <h2>Take a payment from your server</h2>
          <pre style={{ overflow: "auto", fontSize: 13, margin: 0 }}>{`curl ${base}/payments \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{"amount": 15000, "method": "card", "reference": "ORDER-1"}'`}</pre>
        </div>
        {note("Amounts are in cents. Create keys under Developer settings. Webhook events are listed in the README.")}
      </>
    ),
  };
};

P["s/buttons"] = async () => {
  const d = await api("/payment-buttons");
  return {
    title: "Payment buttons", sub: "Reusable pay links you can put on a site or send in a message.",
    actions: [{
      label: "Create button", p: true, fn: async () => {
        const v = await ask("Create payment button", [
          { name: "label", label: "Button label" },
          { name: "amount", label: "Fixed price in rand (blank = customer enters it)", money: true, required: false },
        ], "Create");
        if (v) await api("/payment-buttons", { method: "POST", body: v });
      },
    }],
    content: (
      <>
        {note("Send customers the link below. They pay on a secure checkout page.")}
        {table([
          { h: "Label", f: (r: any) => r.label }, { h: "Price", r: true, f: (r: any) => (r.amount ? R(r.amount) : "Customer enters") },
          { h: "Link", f: (r: any) => <code className="k">{checkoutLink("b", r.token)}</code> }, { h: "", f: (r: any) => btn("Disable", "off|" + r.id, "d") },
        ], d.data, "No buttons yet.")}
      </>
    ),
    on: { off: async (id) => { await api("/payment-buttons/" + id, { method: "DELETE" }); } },
  };
};

P["s/dev"] = async () => {
  const [k, me] = await Promise.all([api("/account/api-keys"), api("/me")]);
  return {
    title: "Developer settings", sub: "API keys and webhooks for connecting your own systems.",
    actions: [
      {
        label: "Create API key", p: true, fn: async () => {
          const v = await ask("Create API key", [
            { name: "label", label: "Label" },
            { name: "role", label: "Access", type: "select", options: [["viewer", "Read only"], ["finance", "Read and move money"], ["admin", "Full access"]] },
          ], "Create");
          if (!v) return;
          const r = await api("/account/api-keys", { method: "POST", body: v });
          await secret("Your new API key", r.key, "Copy it now. For security it cannot be shown again.");
        },
      },
      {
        label: "Set webhook URL", fn: async () => {
          const v = await ask("Webhook URL", [{ name: "url", label: "https:// address that receives events" }], "Save");
          if (!v) return;
          const r = await api("/webhook", { method: "PUT", body: v });
          await secret("Webhook signing secret", r.secret, "Use it to check the X-Manshya-Signature header. It cannot be shown again.");
        },
      },
    ],
    content: (
      <>
        {note(me.webhook_url ? `Webhook: ${me.webhook_url}` : "No webhook set.")}
        {table([
          { h: "Label", f: (r: any) => r.label }, { h: "Access", f: (r: any) => r.role }, { h: "Key", f: (r: any) => r.hint }, { h: "Created", f: (r: any) => dt(r.created_at) },
          { h: "Status", f: (r: any) => tag(r.revoked ? "cancelled" : "active") }, { h: "", f: (r: any) => (r.revoked ? null : btn("Revoke", "rv|" + r.id, "d")) },
        ], k.data)}
      </>
    ),
    on: { rv: async (id) => { await api("/account/api-keys/" + id, { method: "DELETE" }); toast("Key revoked"); } },
  };
};

/* ---------- account ---------- */
P["a/personal"] = profilePage("personal", "Personal information", [
  { name: "name", label: "Full name" }, { name: "email", label: "Email" }, { name: "phone", label: "Phone" }, { name: "id_number", label: "ID number (13 digits)" },
]);
P["a/business"] = profilePage("business", "Business information", [
  { name: "legal_name", label: "Registered name" }, { name: "trading_name", label: "Trading name" }, { name: "registration_number", label: "Registration number" },
  { name: "vat_number", label: "VAT number (10 digits)" }, { name: "industry", label: "Industry" }, { name: "address", label: "Address" }, { name: "phone", label: "Phone" }, { name: "website", label: "Website" },
]);

P["a/ubo"] = async () => {
  const d = await api("/account/ubos");
  const used = d.data.reduce((s: number, u: any) => s + u.ownership_pct, 0);
  return {
    title: "Ultimate beneficial owners", sub: "Everyone who owns 25% or more of the business, or controls it.",
    actions: [{
      label: "Add owner", p: true, fn: async () => {
        const v = await ask("Add a beneficial owner", [
          { name: "name", label: "Full name" }, { name: "idNumber", label: "ID number (13 digits)", required: false },
          { name: "ownershipPct", label: "Ownership %", type: "number" }, { name: "nationality", label: "Nationality", required: false },
        ], "Save");
        if (v) await api("/account/ubos", { method: "POST", body: { ...v, ownershipPct: parseInt(v.ownershipPct, 10) } });
      },
    }],
    content: (
      <>
        {note(`${used}% of ownership declared.`)}
        {table([
          { h: "Name", f: (r: any) => r.name }, { h: "ID number", f: (r: any) => (r.id_number ? "••••••••" + r.id_number.slice(-4) : "—") },
          { h: "Owns", r: true, f: (r: any) => r.ownership_pct + "%" }, { h: "Nationality", f: (r: any) => r.nationality || "—" }, { h: "", f: (r: any) => btn("Remove", "rm|" + r.id, "d") },
        ], d.data)}
      </>
    ),
    on: { rm: async (id) => { await api("/account/ubos/" + id, { method: "DELETE" }); } },
  };
};

P["a/users"] = async () => {
  const d = await api("/account/users");
  const roles: [string, string][] = [["admin", "Admin"], ["finance", "Finance"], ["viewer", "View only"]];
  return {
    title: "User management", sub: "Admins manage everything, finance can move money, view only can look but not change.",
    actions: [{
      label: "Invite user", p: true, fn: async () => {
        const v = await ask("Invite a team member", [{ name: "name", label: "Name" }, { name: "email", label: "Email", type: "email" }, { name: "role", label: "Role", type: "select", options: roles }], "Invite");
        if (v) await api("/account/users", { method: "POST", body: v });
      },
    }],
    content: table([
      { h: "Name", f: (r: any) => r.name }, { h: "Email", f: (r: any) => r.email }, { h: "Role", f: (r: any) => r.role }, { h: "Status", f: (r: any) => tag(r.status) },
      { h: "", f: (r: any) => <>{btn("Change role", "role|" + r.id)}{btn("Remove", "rm|" + r.id, "d")}</> },
    ], d.data, "Only you so far."),
    on: {
      role: async (id) => { const v = await ask("Change role", [{ name: "role", label: "Role", type: "select", options: roles }], "Save"); if (v) await api("/account/users/" + id, { method: "PATCH", body: v }); },
      rm: async (id) => { await api("/account/users/" + id, { method: "DELETE" }); },
    },
  };
};

P["a/activity"] = async () => {
  const d = await api("/account/activity?limit=100");
  return {
    title: "User activity history", sub: "Every change made to your account.",
    content: table([
      { h: "When", f: (r: any) => dt(r.created_at) }, { h: "Who", f: (r: any) => r.actor || "—" }, { h: "Action", f: (r: any) => r.action },
      { h: "Result", f: (r: any) => tag(r.status < 400 ? "completed" : "failed") },
    ], d.data),
  };
};

P["a/security"] = async () => {
  const me = await api("/me");
  return {
    title: "Security",
    content: (
      <>
        {cards([["Your access level", me.role], ["Business verified", me.verified ? "Yes" : "Not yet"]])}
        {note("API keys are stored hashed, every change is recorded under User activity history, and gateway callbacks are signature-checked.")}
        {note("You sign in with your customer account. Manshya receives the signed-in user and applies their role.")}
      </>
    ),
  };
};

P["a/docs"] = async () => {
  const d = await api("/account/documents");
  return {
    title: "Verification documents", sub: "Upload a PDF, PNG or JPEG up to 2 MB. We approve the four required documents to release your retained balance.",
    actions: [{
      label: "Upload a document", p: true, fn: async () => {
        const v = await ask("Upload a document", [
          { name: "type", label: "Type", type: "select", options: [["id_document", "ID document"], ["proof_of_address", "Proof of address"], ["company_registration", "Company registration"], ["bank_letter", "Bank confirmation letter"], ["tax_clearance", "Tax clearance"]] },
          { name: "file", label: "File", type: "file" },
        ], "Upload");
        if (!v) return;
        await api("/account/documents/upload", { method: "POST", body: { type: v.type, filename: v.file.filename, contentBase64: v.file.contentBase64 } });
        toast("Uploaded. We will review it shortly.");
      },
    }],
    content: (
      <>
        {note("Required: ID document, proof of address, company registration and a bank confirmation letter.")}
        {table([
          { h: "Type", f: (r: any) => r.type.replace(/_/g, " ") }, { h: "File", f: (r: any) => r.filename },
          { h: "Status", f: (r: any) => <>{tag(r.status)}{r.note && <> <small>{r.note}</small></>}</> }, { h: "Added", f: (r: any) => dt(r.created_at) },
        ], d.data, "No documents yet.")}
      </>
    ),
  };
};

/* ---------- in-person (card machines) ---------- */
P["p/devices"] = async () => {
  const d = await api("/pos/devices");
  return {
    title: "Card machines",
    actions: [{ label: "Add card machine", p: true, fn: async () => { const v = await ask("Add a card machine", [{ name: "name", label: "Name" }], "Add"); if (v) await api("/pos/devices", { method: "POST", body: v }); } }],
    content: table([
      { h: "Name", f: (r: any) => r.name }, { h: "Status", f: (r: any) => (r.online ? tag("online") : tag("offline")) }, { h: "Last seen", f: (r: any) => dt(r.last_seen) },
    ], d.data, "No card machines yet."),
  };
};

P["p/tx"] = async ({ F }) => {
  const d = await api(`/payments?channel=pos&limit=50&q=${enc(F("q"))}`);
  return {
    title: "Card machine transactions", filters: [{ name: "q", label: "Search reference" }],
    content: table([
      { h: "Date", f: (r: any) => dt(r.created_at) }, { h: "Items", f: (r: any) => (r.items ? r.items.map((i: any) => `${i.qty}× ${i.name}`).join(", ") : "—") },
      { h: "Method", f: (r: any) => r.method }, { h: "Status", f: (r: any) => tag(r.status) }, { h: "Fee", r: true, f: (r: any) => R(r.fee) }, { h: "Amount", r: true, f: (r: any) => R(r.amount) },
      { h: "", f: (r: any) => (r.status === "paid" ? btn("Refund", "rf|" + r.id) : null) },
    ], d.data),
    on: {
      rf: async (id) => {
        if (!(await ask("Refund this sale in full?", [], "Refund"))) return;
        await api(`/payments/${id}/refund`, { method: "POST", idem: true, body: {} });
        toast("Refunded");
      },
    },
  };
};

P["p/cat"] = async () => {
  const d = await api("/pos/categories");
  return {
    title: "Categories",
    actions: [{ label: "Add category", p: true, fn: async () => { const v = await ask("Add a category", [{ name: "name", label: "Name" }], "Add"); if (v) await api("/pos/categories", { method: "POST", body: v }); } }],
    content: table([{ h: "Name", f: (r: any) => r.name }, { h: "", f: (r: any) => btn("Delete", "rm|" + r.id, "d") }], d.data, "No categories yet."),
    on: { rm: async (id) => { await api("/pos/categories/" + id, { method: "DELETE" }); } },
  };
};

P["p/prod"] = async () => {
  const [d, c] = await Promise.all([api("/pos/products"), api("/pos/categories")]);
  const name: Record<string, string> = Object.fromEntries(c.data.map((x: any) => [x.id, x.name]));
  return {
    title: "Products", sub: "Card machine sales are priced from this list.",
    actions: [{
      label: "Add product", p: true, fn: async () => {
        const v = await ask("Add a product", [
          { name: "name", label: "Name" }, { name: "price", label: "Price in rand", money: true },
          { name: "categoryId", label: "Category", type: "select", options: [["", "No category"], ...c.data.map((x: any): [string, string] => [x.id, x.name])] },
        ], "Add");
        if (!v) return;
        if (!v.categoryId) delete v.categoryId;
        await api("/pos/products", { method: "POST", body: v });
      },
    }],
    content: table([
      { h: "Product", f: (r: any) => r.name }, { h: "Category", f: (r: any) => name[r.category_id] || "—" }, { h: "Price", r: true, f: (r: any) => R(r.price) },
      { h: "Status", f: (r: any) => tag(r.active ? "active" : "paused") },
      { h: "", f: (r: any) => <>{btn("Change price", "pr|" + r.id)}{r.active ? btn("Hide", "off|" + r.id, "d") : btn("Show", "on|" + r.id)}</> },
    ], d.data, "No products yet."),
    on: {
      pr: async (id) => { const v = await ask("New price", [{ name: "price", label: "Price in rand", money: true }], "Save"); if (v) await api("/pos/products/" + id, { method: "PATCH", body: v }); },
      off: async (id) => { await api("/pos/products/" + id, { method: "PATCH", body: { active: false } }); },
      on: async (id) => { await api("/pos/products/" + id, { method: "PATCH", body: { active: true } }); },
    },
  };
};

P["p/staff"] = async () => {
  const d = await api("/pos/staff");
  return {
    title: "Staff", sub: "Cashiers sign in on the card machine with a PIN. Five wrong PINs lock the profile for 15 minutes.",
    actions: [{
      label: "Add staff member", p: true, fn: async () => {
        const v = await ask("Add a staff member", [
          { name: "name", label: "Name" },
          { name: "role", label: "Role", type: "select", options: [["cashier", "Cashier"], ["supervisor", "Supervisor"], ["manager", "Manager"]] },
          { name: "pin", label: "PIN (4 to 6 digits)", type: "password" },
        ], "Add");
        if (v) await api("/pos/staff", { method: "POST", body: v });
      },
    }],
    content: table([
      { h: "Name", f: (r: any) => r.name }, { h: "Role", f: (r: any) => r.role }, { h: "Status", f: (r: any) => tag(r.status) },
      { h: "", f: (r: any) => btn(r.status === "active" ? "Suspend" : "Reactivate", `st|${r.id}|${r.status === "active" ? "suspended" : "active"}`) },
    ], d.data, "No staff yet."),
    on: { st: async (id, s) => { await api("/pos/staff/" + id, { method: "PATCH", body: { status: s } }); } },
  };
};

/** Pick a prepaid / bill product, then buy it (shared by card machine prepaid and the bills page). */
export const buyFlow = async (endpoint: string) => {
  const cat = (await api("/bills/catalogue")).data;
  const p1 = await ask("Choose a product", [
    { name: "productId", label: "Product", type: "select", options: cat.map((p: any) => [p.id, `${p.name}${p.price ? " · " + R(p.price) : ""}`]) },
  ], "Next");
  if (!p1) return;
  const prod = cat.find((x: any) => x.id === p1.productId);
  const recipient: Record<string, string> = { phone: "Cellphone number", meter: "Meter number (11 digits)", smartcard: "Smartcard number (10 digits)", account: "Account number" };
  const fields: any[] = [
    { name: "recipient", label: recipient[prod.recipient] },
    { name: "accountId", label: "Pay from", type: "select", options: await accountOptions() },
  ];
  if (!prod.price) fields.splice(1, 0, { name: "amount", label: `Amount in rand (${R(prod.min)} to ${R(prod.max)})`, money: true });
  const v = await ask(prod.name, fields, "Buy");
  if (!v) return;
  const r = await api(endpoint, { method: "POST", idem: true, body: { ...v, productId: prod.id } });
  if (r.token) await secret("Your token", r.token, "Enter it at the meter or redeem it. It is also saved in your purchase history.");
  else toast("Purchase complete");
};

export const purchases = (d: any[]) => table([
  { h: "Date", f: (r: any) => dt(r.created_at) }, { h: "Product", f: (r: any) => r.product }, { h: "For", f: (r: any) => r.recipient },
  { h: "Token", f: (r: any) => (r.token ? <code className="k">{r.token}</code> : "—") }, { h: "Status", f: (r: any) => tag(r.status) }, { h: "Amount", r: true, f: (r: any) => R(r.amount) },
], d, "No purchases yet.");

P["p/prepaid"] = async () => {
  const d = await api("/bills/purchases?source=pos");
  return {
    title: "Prepaid sales", sub: "Airtime, data, electricity and vouchers sold from your card machines.",
    actions: [{ label: "Sell prepaid", p: true, fn: () => buyFlow("/pos/prepaid") }],
    content: purchases(d.data),
  };
};
