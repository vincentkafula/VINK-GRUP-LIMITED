import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["shared/test/**/*.test.ts", "backend/test/**/*.test.ts", "validator/test/**/*.test.ts"], testTimeout: 20000 },
});
