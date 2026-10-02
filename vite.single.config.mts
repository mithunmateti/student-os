/**
 * Standalone build: bundles the whole app into ONE self-contained index.html
 * (standalone/index.html) that runs from disk — no server needed.
 *   npm run build:single
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r("./single"),
  base: "./",
  publicDir: false,
  plugins: [react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: {
    alias: [
      { find: "next/link", replacement: r("./single/next-link.tsx") },
      { find: "next/navigation", replacement: r("./single/next-navigation.ts") },
      { find: "@/lib/pdf-worker", replacement: r("./single/pdf-worker.ts") },
      { find: "./pdf-worker", replacement: r("./single/pdf-worker.ts") },
      { find: "@/lib/sample-assets", replacement: r("./single/sample-assets.ts") },
      { find: /^@\//, replacement: r("./src/") + "/" },
    ],
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    // Tells the app it has no server (skips /api/ai calls).
    "process.env.NEXT_PUBLIC_STANDALONE": JSON.stringify("1"),
  },
  build: {
    outDir: r("./standalone"),
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
  worker: { format: "es" },
});
