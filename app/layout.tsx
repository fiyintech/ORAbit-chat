import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ORAbit — Temporary Chat",
  description: "Temporary chat rooms that disappear.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}