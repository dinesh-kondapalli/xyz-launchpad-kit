"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "@/components/ui/sonner";
import { useWalletStore } from "@/stores/wallet-store";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000, // 30s - data refreshed by SSE between fetches
        refetchOnWindowFocus: true,
        retry: 2,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());
  const autoReconnect = useWalletStore((s) => s.autoReconnect);
  const refreshBalance = useWalletStore((s) => s.refreshBalance);

  // Auto-reconnect on mount (existing from Phase 35)
  useEffect(() => {
    autoReconnect();
  }, [autoReconnect]);

  // Listen for Keplr account/key changes (existing from Phase 35)
  useEffect(() => {
    const handleKeystoreChange = () => {
      refreshBalance();
    };
    window.addEventListener("keplr_keystorechange", handleKeystoreChange);
    return () => {
      window.removeEventListener("keplr_keystorechange", handleKeystoreChange);
    };
  }, [refreshBalance]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
