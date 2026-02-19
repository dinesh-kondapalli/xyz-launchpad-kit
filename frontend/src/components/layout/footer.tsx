import Link from "next/link";
import { TelegramLogo, XLogo } from "@phosphor-icons/react";

const footerLinks = ["Us", "Bridge", "Trade", "$XYZ"];

export function Footer() {
  return (
    <footer className="mt-8 lg:mt-12">
      <div className="mx-auto w-full max-w-7xl px-4 pb-6 sm:px-6 lg:px-8 lg:pb-8">
        <div className="rounded-2xl border border-[#18181b] bg-[#050505] px-6 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-col gap-10 sm:gap-12">
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Connect with us
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <Link
                    href="https://x.com/xyzchainorg"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 w-10 items-center justify-center  text-zinc-200 transition-colors hover:text-zinc-100"
                  >
                    <XLogo size={18} weight="bold" />
                  </Link>
                  <Link
                    href="https://t.me/xyzchainorg"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 w-10 items-center justify-center  text-zinc-200 transition-colors hover:text-zinc-100"
                  >
                    <TelegramLogo size={18} weight="fill" />
                  </Link>
                </div>
              </div>

              <nav className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm text-zinc-400 sm:grid-cols-1 sm:gap-y-4 sm:text-right">
                {footerLinks.map((item) => (
                  <Link
                    key={item}
                    href="#"
                    className="transition-colors hover:text-zinc-100"
                  >
                    {item}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="flex flex-col gap-5 border-t border-zinc-800 pt-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-wrap items-center gap-5 text-sm text-zinc-500">
                <span>
                  {new Date().getFullYear()} XYZ Chain All Rights Reserved
                </span>
                <Link
                  href="#"
                  className="transition-colors hover:text-zinc-300"
                >
                  Privacy
                </Link>
              </div>
              <p className="text-4xl font-bold tracking-tight text-zinc-100 sm:text-6xl">
                XYZ-Launchpad
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
