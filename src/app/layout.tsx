import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Timpanogos Heating & Plumbing (Demo)",
  description:
    "Demo site for a fictional HVAC and plumbing company, showing an AI front desk assistant. All data is synthetic.",
  // A demo of a fake business should never show up in search results.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
