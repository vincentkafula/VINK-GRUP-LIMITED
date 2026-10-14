import { randomBytes } from "node:crypto";
import { COMM } from "./constants";
import { accessBytes } from "./layout";
import { DesfireSession, type Transceiver } from "./session";

/**
 * A protocol check to run on a SPARE card before trusting this code with real fares. It never touches the AFC application: it creates a
 * throw-away application (AID F0F0F0), exercises every kind of message the system relies on, and deletes it again.
 *
 *   authentication            both sides prove they hold the key
 *   MACed write commands      debit and credit carry a CMAC the card verifies
 *   MACed replies             every reply carries a CMAC this code verifies
 *   transaction semantics     nothing changes until commit; abort undoes it
 *   limits                    the card refuses to go below the lower limit
 *   change key (enciphered)   both forms: another key (XOR form) and the key you are logged in with
 *
 * If a step fails on a real card but passes against the simulator, the difference is in the card's behaviour, not in your wiring: do not
 * personalise real cards until every step passes.
 */
export interface StepResult { name: string; ok: boolean; detail?: string }
const TEST_AID = Buffer.from([0xf0, 0xf0, 0xf0]);

export async function runProtocolSelfTest(t: Transceiver, piccKey: Buffer = Buffer.alloc(16)): Promise<StepResult[]> {
  const out: StepResult[] = [];
  const s = new DesfireSession(t);
  const step = async (name: string, fn: () => Promise<string | void>) => {
    try { const detail = await fn(); out.push({ name, ok: true, detail: detail || undefined }); return true; }
    catch (e) { out.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) }); return false; }
  };
  const expect = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
  const zeros = Buffer.alloc(16);
  const k1 = randomBytes(16), k0 = randomBytes(16);

  if (!(await step("authenticate with the card master key", async () => { await s.selectApplication(Buffer.alloc(3)); await s.authenticate(0, piccKey); }))) return out;
  await step("remove any leftover test application", async () => { try { await s.deleteApplication(TEST_AID); } catch { await s.selectApplication(Buffer.alloc(3)); await s.authenticate(0, piccKey); } });
  let created = false;
  try {
    if (!(await step("create the test application (3 AES keys)", async () => { await s.createApplication(TEST_AID, 0x09, 0x80 | 3); created = true; }))) return out;
    await s.selectApplication(TEST_AID);
    await step("authenticate with the application key", async () => { await s.authenticate(0, zeros); });
    await step("create a value file (MACed) and a backup data file (MACed)", async () => {
      const acc = accessBytes({ read: 0, write: 0, readWrite: 0, change: 0 });
      await s.createValueFile({ fileNo: 1, comm: COMM.MACED, access: acc, lower: 0, upper: 100_000, initial: 5000 });
      await s.createBackupFile({ fileNo: 2, comm: COMM.MACED, access: acc, size: 16 });
    });
    await step("read the value (reply MAC checked)", async () => { expect((await s.getValue(1)) === 5000, "expected 5000"); });
    await step("debit is invisible until commit", async () => {
      await s.debit(1, 700); expect((await s.getValue(1)) === 5000, "value changed before commit");
      await s.commit(); expect((await s.getValue(1)) === 4300, "value not 4300 after commit");
    });
    await step("credit then commit", async () => { await s.credit(1, 200); await s.commit(); expect((await s.getValue(1)) === 4500, "value not 4500"); });
    await step("abort undoes uncommitted changes", async () => { await s.debit(1, 1000); await s.abort(); expect((await s.getValue(1)) === 4500, "abort did not undo"); });
    await step("debit and data write commit together", async () => {
      await s.debit(1, 100); await s.writeData(2, 0, Buffer.from("0123456789abcdef")); await s.commit();
      expect((await s.getValue(1)) === 4400, "value"); expect((await s.readData(2, 0, 16)).toString() === "0123456789abcdef", "data");
    });
    await step("the card refuses to go below the lower limit and keeps its value", async () => {
      let refused = false; try { await s.debit(1, 999_999); } catch { refused = true; }
      expect(refused, "the card allowed an overdraft");
      await s.selectApplication(TEST_AID); await s.authenticate(0, zeros);
      expect((await s.getValue(1)) === 4400, "value changed after a refused debit");
    });
    await step("change another key (XOR form, enciphered) and log in with it", async () => {
      await s.changeKey(1, k1, 1, zeros);
      const s2 = new DesfireSession(t); await s2.selectApplication(TEST_AID); await s2.authenticate(1, k1);
      expect((await s2.getKeyVersion(1)) === 1, "key version not updated");
      await s.selectApplication(TEST_AID); await s.authenticate(0, zeros);      // a card has one session at a time: log the first one back in
    });
    await step("change the key you are logged in with, then log in with the new one", async () => {
      await s.changeKey(0, k0, 2);
      const s2 = new DesfireSession(t); await s2.selectApplication(TEST_AID); await s2.authenticate(0, k0);
      expect((await s2.getValue(1)) === 4400, "value lost");
    });
    await step("the old key no longer works", async () => {
      const s2 = new DesfireSession(t); await s2.selectApplication(TEST_AID);
      let refused = false; try { await s2.authenticate(0, zeros); } catch { refused = true; }
      expect(refused, "the card still accepted the old key");
    });
  } finally {
    if (created) {
      await step("delete the test application", async () => { await s.selectApplication(Buffer.alloc(3)); await s.authenticate(0, piccKey); await s.deleteApplication(TEST_AID); });
    }
  }
  return out;
}
