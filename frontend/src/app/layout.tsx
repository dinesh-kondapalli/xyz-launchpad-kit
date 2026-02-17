import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "XYZ Chain",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-16 bottom-[57px] left-0 z-0 hidden w-[220px] bg-[url('/left.png')] bg-[length:100%_100%] bg-center bg-no-repeat xl:block 2xl:w-[280px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-16 bottom-[57px] right-0 z-0 hidden w-[220px] bg-[url('/right.png')] bg-[length:100%_100%] bg-center bg-no-repeat xl:block 2xl:w-[280px]"
        />
        <div className="relative z-10">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
