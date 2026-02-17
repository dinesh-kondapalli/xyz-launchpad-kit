"use client";

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { TokenFeed } from "@/components/feed/token-feed";

export default function HomePage() {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
      <Header />
      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <TokenFeed />
      </main>
      <Footer />
    </div>
  );
}
