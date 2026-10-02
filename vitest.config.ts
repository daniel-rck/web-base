import { defineConfig } from "vitest/config";

// Only the repo's own tests. Template test files (cli/templates/, cli/template-tests/)
// are copied into a scaffolded app and run there, never here.
export default defineConfig({
  test: {
    include: ["cli/src/**/*.test.ts", "cli/test/**/*.test.ts"],
    unstubEnvs: true,
    // The e2e suite runs the bundle; rebuild it from the current source first.
    globalSetup: ["cli/src/e2e/build-dist.ts"],
  },
});
