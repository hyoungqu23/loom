import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "eval/**/*.eval.test.ts"],
    environment: "node",
    reporters: ["default"],
    globals: false,
    // Several suites mutate package-root files (harness/prompts/_common.md,
    // harness/routing.md) for back-compat tests. Run files serially to avoid
    // FS race conditions between suites.
    fileParallelism: false,
  },
});
