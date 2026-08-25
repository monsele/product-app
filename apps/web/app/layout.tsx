import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "AI Visual Learning Platform" };

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
