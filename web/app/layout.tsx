import type { Metadata } from "next";
import { EB_Garamond, Open_Sans } from "next/font/google";
import "./globals.css";

// EB Garamond = a Vietnamese-capable Garamond (matches spacesleftblank's Cormorant look
// while rendering full Vietnamese diacritics). Open Sans for small wide-tracked labels.
const serif = EB_Garamond({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});
const sans = Open_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "600"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Thanh Phung Poetry",
  description: "Grandfather's poems — a digital archive",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
