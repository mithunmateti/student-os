import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Student OS", template: "%s · Student OS" },
  description: "Plan your preparation, analyze every exam, and turn mistakes into your next study plan.",
  applicationName: "Student OS",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e11" },
  ],
};

// Runs before first paint so the saved theme never flashes.
const themeScript = `(function(){try{var t=localStorage.getItem("exam-pilot-theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        {/* Nunito is the rounded font for devices without Apple's SF Pro Rounded. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap" />
      </head>
      <body className="min-h-dvh">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
