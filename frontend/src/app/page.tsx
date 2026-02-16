"use client";

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { TokenFeed } from "@/components/feed/token-feed";
import { ActivityFeed } from "@/components/feed/activity-feed";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-6xl overflow-x-hidden px-6 py-8 lg:px-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-zinc-100">Token Launches</h1>
          <p className="mt-1 text-zinc-400">
            Browse active token launches on XYZ Chain
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <TokenFeed />
          </div>
          <div className="lg:col-span-1">
            <ActivityFeed />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
