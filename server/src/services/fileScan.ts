import net from "node:net";
import crypto from "node:crypto";

/**
 * Checking the files that go through department mail, before they are kept or sent.
 *
 * Three layers, each optional except the first:
 *  1. Built in, always on: the standard EICAR test virus, a program disguised as a document or picture (its first bytes say "program", its name says "pdf"), and a
 *     double extension such as "invoice.pdf.exe". These are checks of the file's shape, NOT an antivirus: they catch careless tricks only.
 *  2. ClamAV, a real antivirus, when CLAMAV_HOST is set (a clamd service reached over TCP, port CLAMAV_PORT, default 3310). The file is streamed to it (INSTREAM).
 *  3. VirusTotal, when VIRUSTOTAL_API_KEY is set: only the file's SHA-256 is looked up, the file itself is never sent anywhere. A file VirusTotal has never seen
 *     stays "unscanned", because not being known is not the same as being safe.
 *
 * A file is "clean" only when a real engine (2 or 3) said so. With none configured the honest result for a harmless file is "unscanned".
 */
export type ScanStatus = "clean" | "infected" | "suspicious" | "unscanned";
export interface ScanResult { status: ScanStatus; detail: string; engine: string }

/** The EICAR test file: harmless text that every antivirus treats as a virus, for checking that scanning is wired up. */
export const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

const DOCUMENT_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|csv|png|jpe?g|gif|webp|bmp|tiff?|heic|mp3|mp4|mov|zip)$/i;
const RUNNABLE_EXT = /\.(exe|bat|cmd|com|scr|msi|dll|jar|apk|js|jse|vbs|vbe|wsf|wsh|ps1|psm1|hta|lnk|reg|iso|dmg|pif|cpl|docm|xlsm|pptm)$/i;

/** What the first bytes of a file say it is, when that is a program. */
function programKind(b: Buffer): string | null {
  if (b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a) return "a Windows program";
  if (b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return "a Linux program";
  if (b.length >= 4 && ((b[0] === 0xfe && b[1] === 0xed && b[2] === 0xfa) || (b[0] === 0xcf && b[1] === 0xfa && b[2] === 0xed && b[3] === 0xfe) || (b[0] === 0xca && b[1] === 0xfe && b[2] === 0xba && b[3] === 0xbe))) return "a Mac program";
  if (b.length >= 2 && b[0] === 0x23 && b[1] === 0x21) return "a script";
  return null;
}

/** Layer 1. Never throws. */
export function builtInScan(data: Buffer, filename: string): ScanResult | null {
  if (data.includes(Buffer.from(EICAR))) return { status: "infected", detail: "EICAR test virus", engine: "built-in" };
  const kind = programKind(data);
  if (kind && DOCUMENT_EXT.test(filename)) return { status: "suspicious", detail: `Named like a document or picture, but it is ${kind}`, engine: "built-in" };
  if (/\.[a-z0-9]{2,5}\.(exe|bat|cmd|com|scr|msi|js|vbs|ps1|hta|lnk|jar)$/i.test(filename) && DOCUMENT_EXT.test(filename.replace(RUNNABLE_EXT, ""))) return { status: "suspicious", detail: "Two file extensions, the last one a program", engine: "built-in" };
  return null;
}

/** Layer 2: ClamAV's INSTREAM protocol. Resolves null when clamd cannot be reached or cannot take the file. */
export function clamdScan(opts: { host: string; port?: number; timeoutMs?: number }, data: Buffer): Promise<ScanResult | null> {
  return new Promise((resolve) => {
    let out = "", done = false;
    const finish = (r: ScanResult | null) => { if (done) return; done = true; sock.destroy(); resolve(r); };
    const sock = net.connect({ host: opts.host, port: opts.port ?? 3310 });
    sock.setTimeout(opts.timeoutMs ?? 60_000, () => finish(null));
    sock.on("error", () => finish(null));
    sock.on("data", (c) => { out += c.toString("utf8"); });
    sock.on("close", () => {
      const m = /stream:\s*(.*?)\s*(FOUND|OK|ERROR)\s*\0?$/.exec(out.replace(/\0/g, "").trim());
      if (!m) return finish(null);
      if (m[2] === "OK") return finish({ status: "clean", detail: "No virus found", engine: "ClamAV" });
      if (m[2] === "FOUND") return finish({ status: "infected", detail: m[1].replace(/\.UNOFFICIAL$/, "") || "virus", engine: "ClamAV" });
      finish(null);
    });
    sock.on("connect", () => {
      sock.write("zINSTREAM\0");
      for (let i = 0; i < data.length; i += 65536) {
        const chunk = data.subarray(i, i + 65536), len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len); sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
  });
}

/** Layer 3: VirusTotal by hash. Null when the key is refused, the quota is used up, or the network fails. A hash it has not seen is "unscanned". */
export async function virusTotalScan(apiKey: string, data: Buffer, fetchImpl: typeof fetch = fetch): Promise<ScanResult | null> {
  const sha = crypto.createHash("sha256").update(data).digest("hex");
  try {
    const r = await fetchImpl(`https://www.virustotal.com/api/v3/files/${sha}`, { headers: { "x-apikey": apiKey }, signal: AbortSignal.timeout(10_000) });
    if (r.status === 404) return { status: "unscanned", detail: "Not known to VirusTotal", engine: "VirusTotal" };
    if (!r.ok) return null;
    const stats = ((await r.json()) as { data?: { attributes?: { last_analysis_stats?: Record<string, number> } } }).data?.attributes?.last_analysis_stats;
    if (!stats) return null;
    const bad = (stats.malicious ?? 0), sus = (stats.suspicious ?? 0), ok = (stats.harmless ?? 0) + (stats.undetected ?? 0);
    if (bad > 0) return { status: "infected", detail: `${bad} antivirus engine${bad === 1 ? "" : "s"} flagged it`, engine: "VirusTotal" };
    if (sus > 0) return { status: "suspicious", detail: `${sus} engine${sus === 1 ? "" : "s"} think it is suspicious`, engine: "VirusTotal" };
    return ok > 0 ? { status: "clean", detail: `${ok} engines found nothing`, engine: "VirusTotal" } : null;
  } catch { return null; }
}

export interface FileScanner {
  /** Which real engines are switched on (empty: only the built-in checks). */
  readonly engines: string[];
  /** True when a real engine is switched on but could not be used for this file. */
  scan(data: Buffer, filename: string): Promise<ScanResult & { engineFailed?: boolean }>;
}

export function createScanner(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): FileScanner {
  const clam = env.CLAMAV_HOST?.trim() ? { host: env.CLAMAV_HOST.trim(), port: Number(env.CLAMAV_PORT) || 3310 } : null;
  const vt = env.VIRUSTOTAL_API_KEY?.trim() || null;
  const engines = [...(clam ? ["ClamAV"] : []), ...(vt ? ["VirusTotal"] : [])];
  return {
    engines,
    async scan(data, filename) {
      const built = builtInScan(data, filename);
      if (built?.status === "infected") return built;
      const results: ScanResult[] = [];
      let failed = false;
      if (clam) { const r = await clamdScan(clam, data); if (r) results.push(r); else failed = true; }
      if (vt) { const r = await virusTotalScan(vt, data, fetchImpl); if (r) results.push(r); else failed = true; }
      const hit = results.find((r) => r.status === "infected"); if (hit) return hit;
      if (built) return built;                                                                     // suspicious by shape
      const sus = results.find((r) => r.status === "suspicious"); if (sus) return sus;
      const clean = results.find((r) => r.status === "clean");
      if (clean) return clean;
      return { status: "unscanned", detail: engines.length ? (failed ? "The antivirus could not be reached" : "Not known to the antivirus") : "Not scanned by an antivirus", engine: engines.join(" + ") || "built-in", ...(engines.length && failed ? { engineFailed: true } : {}) };
    },
  };
}
