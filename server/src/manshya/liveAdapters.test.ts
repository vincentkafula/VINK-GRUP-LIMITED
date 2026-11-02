import { describe, it, expect } from "vitest";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
const { createManshya } = require("./core");

/** Live mode must never quietly run on a mock: a mock identity check verifies everyone, mock rails record transfers that never leave. */
const real = () => ({ rails: {}, bills: {}, identity: {}, vehicle: {}, mailer: { send: async () => ({ id: "x" }) }, gateways: { acme: { name: "acme" } } });
const live = (over: any = {}, drop?: string) => { const o: any = { paymentsMode: "live", config: { mode: "live", defaultGateway: "acme" }, ...real(), ...over }; if (drop) delete o[drop]; return createManshya(o); };

describe("live mode and the bundled stand-ins", () => {
  it("starts when every adapter is supplied", () => { const mn = live(); expect(mn.config.mode).toBe("live"); mn.close?.(); mn.db.close(); });
  it("refuses to start with no adapters at all, and names every one that is missing", () => {
    expect(() => createManshya({ paymentsMode: "live", config: { mode: "live" } })).toThrow(/Live mode refuses the bundled stand-ins/);
    try { createManshya({ paymentsMode: "live", config: { mode: "live" } }); } catch (e: any) { for (const w of ["rails", "bills", "identity", "vehicle", "mailer", "payment gateway"]) expect(e.message, w).toContain(w); }
  });
  it("refuses when any single one is missing, naming only that one", () => {
    for (const [drop, word] of [["rails", "rails"], ["bills", "bills"], ["identity", "identity"], ["vehicle", "vehicle"], ["mailer", "mailer"], ["gateways", "payment gateway"]] as const) {
      let msg = ""; try { live({}, drop); } catch (e: any) { msg = e.message; }
      expect(msg, drop).toContain(word); expect(msg.split(";").length, `only ${drop} is named`).toBe(1);
    }
  });
  it("refuses a gateway that is only the mock one, even if some are supplied", () => {
    expect(() => live({ config: { mode: "live" } })).toThrow(/payment gateway/); expect(() => live({ gateways: {} })).toThrow(/payment gateway/);
  });
  it("refuses on a real database file too, before returning an engine", () => {
    const os = require("os"), path = require("path"), fs = require("fs"); const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "la-")), "m.db");
    expect(() => createManshya({ dbPath: file, paymentsMode: "live", config: { mode: "live" } })).toThrow(/stand-ins/); fs.rmSync(file, { force: true }); fs.rmSync(file + "-wal", { force: true }); fs.rmSync(file + "-shm", { force: true });
  });
  it("does not affect the sandbox, which runs on the stand-ins by design, and still gives the database-mode error first when a sandbox database is opened as live", () => {
    const mn = createManshya({ paymentsMode: "sandbox" }); expect(mn.config.mode).toBe("test"); mn.db.close();
    const os = require("os"), path = require("path"), fs = require("fs"); const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "la-")), "m.db"); createManshya({ dbPath: file, paymentsMode: "sandbox" }).close();
    expect(() => createManshya({ dbPath: file, paymentsMode: "live", config: { mode: "live" } })).toThrow(/sandbox mode and cannot be opened in live mode/);
  });
});
