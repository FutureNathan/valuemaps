import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Value Maps — what the world cares about",
  description:
    "Spin a 3D globe and see the values of every region on Earth. Pick your location, share what you care about, and watch the world's priorities take shape — economy, society, the environment and more.",
  openGraph: {
    title: "Value Maps",
    description: "A 3D globe of what the world actually cares about.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
