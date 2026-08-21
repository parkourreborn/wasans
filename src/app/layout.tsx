import type { Metadata } from "next";
import {  Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { ClientErrorLogger } from "@/components/custom/client-error-logger";
import { V2AuthRefresh } from "@/components/custom/v2-auth-refresh";
import "./globals.css";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "wasans",
  description: "hi i wasans i'm trying to explain my sin",
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable, "dark")}>
        <head>
          <meta name="google-adsense-account" content="ca-pub-1717866889959310" />
          <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1717866889959310" crossOrigin="anonymous" />
          {/* <link rel="icon" type="image/png" sizes="16x16" href="https://tully.sh/icons/favicon-16x16.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="https://tully.sh/icons/favicon-32x32.png" />
          <link rel="icon" type="image/x-icon" sizes="16x16" href="https://tully.sh/icons/favicon.ico" /> */}
        </head>
      <body>
        <ClientErrorLogger />
        <V2AuthRefresh />
        {children}
      </body>
    </html>
  );
}
