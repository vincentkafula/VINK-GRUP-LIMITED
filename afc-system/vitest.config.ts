import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["shared/test/**/*.test.ts", "backend/test/**/*.test.ts", "validator/test/**/*.test.ts"],
    testTimeout: 30_000,
    // the backend tests each start a real (embedded) Postgres, apply the migrations and seed it: give that time, and run those files one at a time
    hookTimeout: 180_000,
    pool: "forks",
    fileParallelism: false,
  },
});
