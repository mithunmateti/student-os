import { defineConfig } from "vitest/config";

// End-to-end tests: drive the built single-file app (standalone/index.html) in real Chrome.
// Run with `npm run test:e2e` (builds first). Set CHROME_PATH if Chrome isn't in /Applications.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    environment: "node",
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
