import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

const font = Open_Sans({ subsets: ["latin"] });

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
    <html lang="en">
        <head>
          {/* <link rel="icon" type="image/png" sizes="16x16" href="https://tully.sh/icons/favicon-16x16.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="https://tully.sh/icons/favicon-32x32.png" />
          <link rel="icon" type="image/x-icon" sizes="16x16" href="https://tully.sh/icons/favicon.ico" /> */}
        </head>
      <body className={font.className}>
        {children}
      </body>
    </html>
  );
}
