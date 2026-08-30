import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ToastProvider } from "../components/ui/toast-provider";
import { NavigationProgressBar } from "../components/layout/navigation-progress-bar";
import "./globals.css";

export const metadata: Metadata = { title: "AI Visual Learning Platform" };

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body suppressHydrationWarning>
        <Suspense fallback={null}>
          <NavigationProgressBar />
        </Suspense>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
