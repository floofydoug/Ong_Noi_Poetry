import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ông Nội Poetry",
  description: "Grandfather's poems — a digital archive",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
