"use client";

import Link from "next/link";
import { ConnectButton } from "@/components/wallet/connect-button";

export function Header() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-6 sm:gap-4 lg:px-10">
        <div className="flex items-center gap-2 sm:gap-6 overflow-hidden">
          <Link href="/" className="font-bold text-xl">
            XYZ
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/"
              className="min-h-[44px] flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors text-nowrap"
            >
              Launches
            </Link>
            <Link
              href="/create"
              className="min-h-[44px] flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors text-nowrap"
            >
              Create Token
            </Link>
          </nav>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
