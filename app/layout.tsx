import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Value Maps — what the world wants",
  description:
    "Spin a 3D globe and share what you want for where you live — pick every hope you hold, even ones people say you can't have together. Compare against real open data, and explore the Moon and Mars too.",
  openGraph: {
    title: "Value Maps",
    description: "A 3D globe of what the world actually wants. No left–right boxes.",
    type: "website",
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
