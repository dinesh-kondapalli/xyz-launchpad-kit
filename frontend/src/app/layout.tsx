import type { Metadata } from "next";
import { Geist_Mono, Golos_Text } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const golosText = Golos_Text({
  variable: "--font-golos-text",
  subsets: ["latin"],
  adjustFontFallback: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "XYZ - Launchpad",
  description: "DeFi platform for XYZ Chain",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${golosText.variable} ${geistMono.variable} antialiased`}
      >
        <div className="relative z-10">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
