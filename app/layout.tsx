import type { Metadata, Viewport } from "next";
import "./globals.css";

// Absolute URLs for og:image etc. Uses the Vercel production domain in prod,
// or set NEXT_PUBLIC_SITE_URL to your custom domain.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://values.nathantowianski.com";

const description =
  "Pick what you want for where you live — even hopes they say you can't have together. A 3D globe of the world's values, with real open data, across Earth, the Moon and Mars.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Value Maps — what the world wants",
  description,
  applicationName: "Value Maps",
  openGraph: {
    title: "Value Maps — what the world wants",
    description,
    url: "/",
    siteName: "Value Maps",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Value Maps — what the world wants",
    description: "A 3D globe of what the world actually wants. No left–right boxes — pick every hope you hold.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
