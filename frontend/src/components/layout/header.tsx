"use client";

import Link from "next/link";
import { ConnectButton } from "@/components/wallet/connect-button";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3 overflow-hidden sm:gap-6">
          <Link href="/" className="text-lg font-black tracking-wide text-foreground sm:text-xl">
            XYZ.LIVE
          </Link>
          <nav className="hidden items-center gap-2 text-sm sm:flex sm:gap-4">
            <Link
              href="/"
              className="inline-flex h-9 items-center text-nowrap font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              [launches]
            </Link>
            <Link
              href="/create"
              className="inline-flex h-9 items-center text-nowrap font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              [start coin]
            </Link>
            <span className="inline-flex h-9 items-center text-muted-foreground/70">[support]</span>
          </nav>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
