import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { startEmbeddedPg } from "./embeddedPg";

/**
 * `npm run dev:embedded` - start a local Postgres, apply the migrations, seed the sample data, then run the API against it.
 * Data lives in backend/.pgdata and survives restarts. Stop with Ctrl+C.
 */
const dataDir = join(process.cwd(), ".pgdata");
const port = Number(process.env.EMBEDDED_PG_PORT ?? 54329);
const pg = await startEmbeddedPg({ dir: dataDir, port, persistent: true });
process.env.DATABASE_URL = pg.url;
console.log(`[dev] Postgres ready on ${pg.url}`);
const run = (args: string[]) => execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", args, { stdio: "inherit", env: process.env, cwd: process.cwd(), shell: process.platform === "win32" });
run(["prisma", "migrate", "deploy"]);
run(["tsx", "prisma/seed.ts"]);
process.on("SIGINT", async () => { await pg.stop(); process.exit(0); });
await import("./server");
