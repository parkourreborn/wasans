import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Saira_Condensed } from "next/font/google";
import { cn } from "@/lib/utils";
import { ClientErrorLogger } from "@/components/custom/client-error-logger";
import { V2AuthRefresh } from "@/components/custom/v2-auth-refresh";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const saira = Saira_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-saira",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "wasans", template: "%s · wasans" },
  description: "Parkour Reborn time trial leaderboards, world records and run submissions.",
};

export const viewport: Viewport = {
  themeColor: "#080808",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark font-sans", plexSans.variable, plexMono.variable, saira.variable)}>
      <body>
        <ClientErrorLogger />
        <V2AuthRefresh />
        {children}
      </body>
    </html>
  );
}
