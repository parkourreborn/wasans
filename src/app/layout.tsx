import type { Metadata } from "next";
import {  Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { ClientErrorLogger } from "@/components/custom/client-error-logger";
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
          {/* <link rel="icon" type="image/png" sizes="16x16" href="https://tully.sh/icons/favicon-16x16.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="https://tully.sh/icons/favicon-32x32.png" />
          <link rel="icon" type="image/x-icon" sizes="16x16" href="https://tully.sh/icons/favicon.ico" /> */}
        </head>
      <body>
        <ClientErrorLogger />
        {children}
      </body>
    </html>
  );
}
