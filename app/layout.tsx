import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "./components/ThemeToggle";

export const metadata: Metadata = {
  title: "ORAbit — Temporary Chat",
  description:
    "Temporary chat rooms that disappear.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
    >
      <body>
        <ThemeToggle />

        {children}
      </body>
    </html>
  );
}

