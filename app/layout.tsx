import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ipg.inc",
  description: "Talk to your users 24/7.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
