import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A real PostgreSQL started from an npm package (no Docker, no install). Used for tests and for `npm run dev:embedded`,
 * so the whole system runs on a laptop with nothing but Node. Production uses a normal Postgres (see docker-compose.yml).
 */
export interface EmbeddedPg { url: string; port: number; stop(): Promise<void> }

export async function startEmbeddedPg(o: { dir?: string; port?: number; persistent?: boolean } = {}): Promise<EmbeddedPg> {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const port = o.port ?? 20000 + Math.floor(Math.random() * 20000);
  const temp = !o.dir;
  const dir = o.dir ?? mkdtempSync(join(tmpdir(), "afc-pg-"));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "afc", port, persistent: true, onLog: () => {}, onError: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("afc");
  return {
    url: `postgresql://postgres:afc@127.0.0.1:${port}/afc`,
    port,
    async stop() { try { await pg.stop(); } catch { /* already stopped */ } if (temp) try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* the OS cleans temp */ } },
  };
}
