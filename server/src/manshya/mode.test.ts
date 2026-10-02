import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createManshya } = require("./core");

describe("sandbox/live separation in the Manshya database", () => {
  it("tags every journal and payment with the mode it was created in", async () => {
    const mn = createManshya({ paymentsMode: "sandbox" });
    const m = mn.services.createMerchant("Tag Co");
    await mn.services.createPayment(m, { amount: 10000, method: "card", channel: "online", paymentToken: "tok_visa", reference: "t1", customer: { name: "A", email: "a@b.co" } });
    const modes = (t: string) => mn.db.prepare(`SELECT DISTINCT mode FROM ${t}`).all().map((r: { mode: string }) => r.mode);
    expect(modes("journals")).toEqual(["sandbox"]);
    expect(modes("payments")).toEqual(["sandbox"]);
    expect(mn.db.prepare("SELECT COUNT(*) n FROM journals WHERE mode IS NULL").get().n).toBe(0);
    mn.close();
  });

  it("refuses to open a database in the other mode", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mn-")), "m.db");
    createManshya({ dbPath: file, paymentsMode: "sandbox" }).close();
    expect(() => createManshya({ dbPath: file, paymentsMode: "live", config: { mode: "live" } })).toThrow(/sandbox mode and cannot be opened in live mode/);
    createManshya({ dbPath: file, paymentsMode: "sandbox" }).close();   // same mode still opens
  });

  it("backfills rows written before tagging existed", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mn-")), "m.db");
    const a = createManshya({ dbPath: file, paymentsMode: "sandbox" });
    a.db.prepare("INSERT INTO journals(id,kind,ref,memo,created_at,mode) VALUES('old','x','r','m','2026-01-01',NULL)").run();
    a.close();
    const b = createManshya({ dbPath: file, paymentsMode: "sandbox" });
    expect(b.db.prepare("SELECT mode FROM journals WHERE id='old'").get().mode).toBe("sandbox");
    b.close();
  });
});
