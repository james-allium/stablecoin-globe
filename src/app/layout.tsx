import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Follow the Money — Stablecoin Globe",
  description: "Real-time 3D visualization of global stablecoin flows",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
