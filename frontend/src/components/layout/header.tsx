"use client";

import Link from "next/link";
import { ConnectButton } from "@/components/wallet/connect-button";

export function Header() {
  return (
    <header className="border-b">
      <div className="container mx-auto flex items-center justify-between h-16 px-4 gap-2 sm:gap-4">
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
