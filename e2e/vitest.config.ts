import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["*.test.ts"], testTimeout: 360_000, hookTimeout: 90_000, fileParallelism: false },
});
