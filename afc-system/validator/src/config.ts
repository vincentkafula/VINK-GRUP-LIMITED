import { z } from "zod";

/** Validator settings, all from the environment (see .env.example). The device secret is the one issued when the device was registered. */
const schema = z.object({
  DEVICE_ID: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/),
  DEVICE_SECRET: z.string().regex(/^[0-9a-fA-F]{64}$/, "DEVICE_SECRET must be the 64 hex characters shown when the device was registered").optional(),
  SERVER_URL: z.string().url().default("http://localhost:4000"),
  ROUTE_ID: z.coerce.number().int().min(1).max(65535),
  /** The stop this device is at. For a vehicle, the driver's console or GPS updates it through the local control port. */
  STOP_ID: z.coerce.number().int().min(0).max(65535).default(0),
  SQLITE_PATH: z.string().default("./validator.db"),
  CONTROL_PORT: z.coerce.number().int().default(7070),
  SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(30),
  FEEDBACK: z.enum(["console", "gpio"]).default("console"),
  SIMULATOR: z.string().optional(),
});
export type ValidatorConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const p = schema.safeParse(env);
  if (!p.success) throw new Error("Invalid validator configuration:\n" + p.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
  const e = p.data;
  return {
    deviceId: e.DEVICE_ID,
    deviceSecret: e.DEVICE_SECRET ? Buffer.from(e.DEVICE_SECRET, "hex") : undefined,
    serverUrl: e.SERVER_URL.replace(/\/+$/, ""),
    routeId: e.ROUTE_ID,
    stopId: e.STOP_ID,
    sqlitePath: e.SQLITE_PATH,
    controlPort: e.CONTROL_PORT,
    syncIntervalSeconds: e.SYNC_INTERVAL_SECONDS,
    feedback: e.FEEDBACK,
    simulator: e.SIMULATOR === "1",
  };
}
