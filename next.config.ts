import type { NextConfig } from "next";
import tess from "tesseract.js/package.json" with { type: "json" };
import tessCore from "tesseract.js-core/package.json" with { type: "json" };

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy (the "without nonces" setup from the Next.js CSP guide). Scripts only
 * from this site, plus the version-pinned Tesseract OCR files; connections only to this site,
 * Google Gemini and the pinned OCR language data. The single-file build gets a stricter,
 * hash-based policy from scripts/add-csp.mjs.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net/npm/tesseract.js@v${tess.version}/ https://cdn.jsdelivr.net/npm/tesseract.js-core@v${tessCore.version}/${isDev ? " 'unsafe-eval'" : ""}`,
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self' https://generativelanguage.googleapis.com https://cdn.jsdelivr.net/npm/@tesseract.js-data/ data: blob:${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lets phones and tablets on the same Wi-Fi open the dev server (e.g. http://192.168.1.20:3000).
  // Without this, Next blocks the page's dev scripts and the app never starts.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
