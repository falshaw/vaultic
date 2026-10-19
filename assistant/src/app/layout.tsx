import type { Metadata } from "next";
import { Space_Grotesk, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Self-hosted at build time (no runtime Google fetch — fits the zero-egress story).
// Deliberately NOT Inter: Space Grotesk (display) + Hanken Grotesk (body) + mono.
const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--f-display" });
const body = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--f-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--f-mono" });

export const metadata: Metadata = {
  title: "Vaultic — Private AI over your own documents",
  description: "A private AI assistant over your own documents, running entirely on your own infrastructure. Cited answers, immutable audit log, zero data egress.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
