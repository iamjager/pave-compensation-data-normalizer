import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pave Integration Mapper",
  description: "Map raw HR exports to the standard compensation schema",
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
