import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/** Display font for logo / brand moments only */
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Final Round — Readiness Assessment",
    template: "%s · Final Round",
  },
  description:
    "Finance interview prep: webcam environment check (CNN) plus technical answer analysis (NLP). Fit score and coaching narrative for IB and quant roles.",
  applicationName: "Final Round",
  keywords: [
    "finance interview",
    "investment banking",
    "M&A",
    "LBO",
    "valuation",
    "interview prep",
    "readiness assessment",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Final Round",
    title: "Final Round — Readiness Assessment",
    description:
      "Environment + technical analysis for finance interviews. Prototype screening-assist tool.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Final Round — Readiness Assessment",
    description:
      "Environment + technical analysis for finance interviews. Fit score and narrative feedback.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${inter.variable} ${geistMono.variable} ${plusJakarta.variable} bg-[#0A0A0A] min-h-screen antialiased text-zinc-100 selection:bg-zinc-100 selection:text-black`}
      >
        {children}
      </body>
    </html>
  );
}
