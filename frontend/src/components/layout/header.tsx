"use client";

import { ConnectButton } from "@/components/wallet/connect-button";

export function Header() {
  return (
    <header className="fixed top-0 right-0 left-0 z-40 bg-black/95 backdrop-blur-xl">
      <div className="flex h-16 w-full items-center">
        <div className="hidden h-full w-64 items-center px-6 lg:flex">
          <span className="text-base font-bold text-zinc-100">XYZ</span>
        </div>
        <div className="flex h-full flex-1 items-center">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:justify-end lg:px-8">
            <span className="text-base font-bold text-zinc-100 lg:hidden">
              XYZ
            </span>
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}
