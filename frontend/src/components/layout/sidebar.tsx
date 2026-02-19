"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CaretLeft,
  CaretRight,
  PlusCircle,
  SquaresFour,
} from "@phosphor-icons/react";

const navItems = [
  { label: "Board", href: "/", icon: SquaresFour, disabled: false },
  { label: "Create Token", href: "/create", icon: PlusCircle, disabled: false },
];

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] flex-col overflow-x-hidden bg-black/95 px-4 pb-6 pt-5 text-zinc-100 transition-[width] duration-300 ease-in-out lg:flex ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      <div className="flex items-center justify-between px-2">
        <div
          className={`overflow-hidden whitespace-nowrap text-[11px] uppercase tracking-[0.2em] text-zinc-500 transition-all ease-in-out ${
            isCollapsed
              ? "max-w-0 -translate-x-2 opacity-0 duration-100"
              : "max-w-40 translate-x-0 opacity-100 delay-75 duration-200"
          }`}
        >
          Main Menu
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-zinc-950 text-zinc-400 transition-colors hover:text-zinc-100"
        >
          {isCollapsed ? (
            <CaretRight size={14} weight="bold" />
          ) : (
            <CaretLeft size={14} weight="bold" />
          )}
        </button>
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
              title={isCollapsed ? item.label : undefined}
              className={`group flex items-center gap-3 overflow-hidden rounded-md border border-transparent px-3 py-2 text-sm font-medium transition-colors ${
                item.disabled
                  ? "pointer-events-none text-zinc-600"
                  : "text-zinc-300  hover:text-zinc-100"
              } ${isActive ? "relative  text-zinc-100" : ""}`}
            >
              {isActive ? (
                <span className="pointer-events-none absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-r-sm bg-primary/80" />
              ) : null}
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${
                  isActive
                    ? " text-zinc-100"
                    : item.disabled
                      ? " text-zinc-600"
                      : " text-zinc-400 group-hover:text-zinc-100"
                }`}
              >
                <Icon size={16} weight={isActive ? "fill" : "bold"} />
              </span>
              <span
                className={`overflow-hidden whitespace-nowrap tracking-wide transition-all ease-in-out ${
                  isCollapsed
                    ? "max-w-0 -translate-x-2 opacity-0 duration-100"
                    : "max-w-40 translate-x-0 opacity-100 delay-75 duration-200"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
