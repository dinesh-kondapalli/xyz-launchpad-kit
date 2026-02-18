"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  PlusCircle,
  SquaresFour,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react";

const navItems = [
  { label: "Board", href: "/", icon: SquaresFour },
  { label: "Create Token", href: "/create", icon: PlusCircle },
  { label: "Referral Program", href: "#", disabled: true, icon: UsersThree },
  { label: "Leaderboard", href: "#", disabled: true, icon: Trophy },
  { label: "Docs", href: "#", disabled: true, icon: BookOpenText },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] w-64 flex-col bg-black/95 px-4 pb-6 pt-5 text-zinc-100 lg:flex">
      <div className="px-2">
        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          Main Menu
        </div>
      </div>

      <nav className="mt-5 flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const isActive = !item.disabled && pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              href={item.href}
              aria-disabled={item.disabled}
              className={`group flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm font-medium transition-colors ${
                item.disabled
                  ? "pointer-events-none text-zinc-600"
                  : "text-zinc-300  hover:bg-zinc-900/60 hover:text-zinc-100"
              } ${isActive ? "relative bg-zinc-900/70 text-zinc-100" : ""}`}
            >
              {isActive ? (
                <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded-t-md bg-pink-500/70" />
              ) : null}
              <span
                className={`flex h-7 w-7 items-center justify-center rounded border ${
                  isActive
                    ? " bg-zinc-800 text-zinc-100"
                    : item.disabled
                      ? " bg-zinc-950 text-zinc-600"
                      : " bg-zinc-950 text-zinc-400 group-hover:text-zinc-100"
                }`}
              >
                <Icon size={16} weight="bold" />
              </span>
              <span className="tracking-wide">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-2 text-xs text-zinc-600">
        Built for launchpads
      </div>
    </aside>
  );
}
