import { loadConfig } from "./config";
import { createDb } from "./db";
import { buildApp } from "./http/app";

const config = loadConfig();
const db = createDb(config.databaseUrl);
const app = await buildApp({ config, db }, { logger: true });

const stop = async () => { await app.close(); await db.$disconnect(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await app.listen({ port: config.port, host: config.host });
