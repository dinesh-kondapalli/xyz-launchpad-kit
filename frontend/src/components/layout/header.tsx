"use client";

import Link from "next/link";
import { ConnectButton } from "@/components/wallet/connect-button";

export function Header() {
  return (
    <header className="fixed top-0 right-0 left-0 z-40 border-b border-zinc-900 bg-black/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 overflow-hidden sm:gap-6">
          <nav className="hidden items-center gap-2 font-mono text-sm sm:flex sm:gap-4">
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
