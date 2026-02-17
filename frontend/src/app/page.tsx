"use client";

import Link from "next/link";
import { BarChart3, BookText, LayoutGrid, Trophy, UserPlus } from "lucide-react";
import { TokenFeed } from "@/components/feed/token-feed";
import { ConnectButton } from "@/components/wallet/connect-button";

const menuItems = [
  { href: "/", label: "Board", icon: LayoutGrid },
  { href: "/create", label: "Create Token", icon: UserPlus },
  { href: "/", label: "Referral Program", icon: Trophy },
  { href: "/", label: "Leaderboard", icon: BarChart3 },
  { href: "/", label: "Docs", icon: BookText },
];

const tickerItems = [
  "hbhDet +6,500 SOL",
  "Wv3Rxy create smallPEPE",
  "Q5m2YJ graduated",
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#000000] text-foreground">
      <header className="sticky top-0 z-40 border-b border-[#1c1c1c] bg-black/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-3 sm:px-5">
          <Link href="/" className="flex min-w-fit items-center gap-2 pr-2 text-sm font-semibold text-[#ff4ea3]">
            <span className="inline-block size-2 rounded-full bg-[#ff4ea3]" />
            <span>OePen Fund</span>
          </Link>
          <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
            {tickerItems.map((item) => (
              <div
                key={item}
                className="truncate rounded-sm border border-[#262626] bg-[#0d0d0d] px-3 py-1.5 text-xs text-[#c7c7c7]"
              >
                {item}
              </div>
            ))}
          </div>
          <div className="ml-auto">
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-0 px-2 pb-8 pt-3 sm:px-4 lg:grid-cols-[220px_1fr] lg:gap-5">
        <aside className="hidden rounded-sm border border-[#1c1c1c] bg-[#050505] p-4 lg:block">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a8a8a]">Main Menu</p>
          <nav className="space-y-1.5">
            {menuItems.map((item, index) => {
              const Icon = item.icon;
              const active = index === 0;
              return (
                <Link
                  key={`${item.label}-${item.href}`}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-sm border px-3 py-2 text-sm transition-colors ${
                    active
                      ? "border-[#b63f79] bg-[#111111] text-white"
                      : "border-transparent text-[#bbbbbb] hover:border-[#252525] hover:bg-[#0c0c0c] hover:text-white"
                  }`}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          <TokenFeed />
        </div>
      </main>
    </div>
  );
}
