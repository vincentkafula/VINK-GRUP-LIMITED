import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // No include/exclude here meant vitest fell back to its own default
    // glob, which matches *.test.ts anywhere in the project -- including
    // server/'s tests, which need a Node environment and a real `pg`
    // connection, not jsdom. Scoped explicitly to this project's own
    // src/ so the two test suites (frontend here, backend via
    // server/vitest.config.ts) never cross-contaminate.
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["node_modules/", "src/test/", "src/imports/"],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
