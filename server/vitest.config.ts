import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The Postgres integration tests share one database (and its ledger totals), so test files must not run at the same time.
    fileParallelism: false,
  },
});
