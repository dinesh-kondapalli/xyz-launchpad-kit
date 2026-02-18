"use client";

import Link from "next/link";
import { ConnectButton } from "@/components/wallet/connect-button";

export function Header() {
  return (
    <header className="fixed top-0 right-0 left-0 z-40 bg-black/95 backdrop-blur-xl">
      <div className="flex h-16 w-full items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <div className="flex items-center gap-3 overflow-hidden sm:gap-6">
          <span className="text-base font-bold text-zinc-100">XYZ-Bridge</span>
          <nav className="flex items-center gap-2 font-mono text-xs sm:gap-4 sm:text-sm lg:hidden">
            <Link
              href="/"
              className="inline-flex h-9 items-center text-nowrap font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              [board]
            </Link>
            <Link
              href="/create"
              className="inline-flex h-9 items-center text-nowrap font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              [create token]
            </Link>
          </nav>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
