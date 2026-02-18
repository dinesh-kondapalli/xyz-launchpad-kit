"use client";

import { TokenFeed } from "@/components/feed/token-feed";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <TokenFeed />
    </div>
  );
}
