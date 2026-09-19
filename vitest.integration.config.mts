import { defineConfig } from "vitest/config";
import base from "./vitest.config.mts";
// mergeConfig concatenates arrays; it would retain the unit config's integration exclusion.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["tests/integration/**/*.test.ts"],
    exclude: [],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
