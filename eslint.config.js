// ESLint flat config (ESLint 9+). Scope: catch real bugs, not enforce
// style — this codebase has no prior linting, so a strict style ruleset
// would flag thousands of pre-existing, harmless deviations and drown
// out the findings that actually matter. Tuned deliberately narrow:
//
//   - react-hooks/rules-of-hooks: catches hooks called after an early
//     return (`if (!isOpen) return null` before a useState/useEffect).
//     This exact bug was found and manually fixed multiple times this
//     session (ManagementPanelViewer.tsx, InvestorFleetDashboardViewer.tsx,
//     and others) -- this rule would have caught every one of them
//     automatically, before merge, instead of requiring a manual
//     line-by-line audit.
//   - react-hooks/exhaustive-deps: warn only (not error) -- genuinely
//     useful for catching stale-closure bugs, but has enough legitimate
//     false positives in real code that erroring on it would block CI
//     for non-bugs.
//   - @typescript-eslint/no-explicit-any, no-unused-vars: warn only, to
//     surface debt without blocking builds on pre-existing code.
//
// Deliberately NOT included: formatting/style rules (quotes, semicolons,
// indentation) -- those are Prettier's job if/when that's added, and
// mixing them into this config would make the signal-to-noise ratio
// worse, not better.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "android", "ios", "desktop", "public", "server", "*-app", "router-cwmp-client"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { window: "readonly", document: "readonly", console: "readonly", fetch: "readonly", localStorage: "readonly", sessionStorage: "readonly", navigator: "readonly" },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // The rule that matters most for this codebase's history.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      "react-refresh/only-export-components": "off", // this app doesn't use Fast Refresh in a way that needs this

      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-empty-object-type": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-constant-condition": ["warn", { checkLoops: false }],
    },
  },
);
