"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/wallet/connect-button";
import { useSidebar } from "@/components/layout/sidebar-context";

const navItems = [
  { label: "boards", href: "/" },
  { label: "create-token", href: "/create" },
];

export function Header() {
  const pathname = usePathname();
  const { isCollapsed } = useSidebar();

  return (
    <header className="fixed top-0 right-0 left-0 z-40 bg-black/95 backdrop-blur-xl border-b border-zinc-900">
      <div
        className={`transition-[padding-left] duration-300 ease-in-out ${
          isCollapsed ? "lg:pl-20" : "lg:pl-64"
        }`}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <span className="text-base font-bold tracking-tight text-zinc-100">XYZ</span>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-2 py-1 text-sm font-mono transition-colors ${
                      isActive
                        ? "text-primary"
                        : "text-zinc-500 hover:text-zinc-200"
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
