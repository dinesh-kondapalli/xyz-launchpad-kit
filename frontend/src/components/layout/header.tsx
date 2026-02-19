"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/wallet/connect-button";

const headerNavItems = [
  { label: "board", href: "/" },
  { label: "create token", href: "/create" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 right-0 left-0 z-40 bg-black/95 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 w-full items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 overflow-hidden sm:gap-6">
            <span className="text-base font-bold text-zinc-100">XYZ-Bridge</span>
            <nav className="flex items-center gap-2 font-mono text-xs sm:gap-4 sm:text-sm">
              {headerNavItems.map((item) => {
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex h-9 items-center text-nowrap font-medium transition-colors hover:text-zinc-100 ${
                      isActive ? "text-zinc-100" : "text-zinc-400"
                    }`}
                  >
                    [{item.label}]
                  </Link>
                );
              })}
            </nav>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
