import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Existing DOM synchronization patterns are advisory until their dedicated refactor.
  // React Compiler is not enabled; correctness rules remain errors. See docs/QUALITY.md.
  { files: ["app/components/Language.tsx", "app/components/PremiumSelect.tsx", "app/components/PropertyActions.tsx", "app/components/PropertyFormFeedback.tsx", "app/components/ReportDownloadControls.tsx", "app/components/WorkspaceShell.tsx"], rules: { "react-hooks/set-state-in-effect": "warn" } },
  { files: ["app/components/PremiumSelect.tsx"], rules: { "react-hooks/purity": "warn" } },
  { files: ["app/components/PropertyEditForm.tsx", "app/components/PropertyForm.tsx", "app/components/PropertyFormFeedback.tsx"], rules: { "react-hooks/refs": "warn" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
