"use client";

import { useState } from "react";
import { Wallet } from "@phosphor-icons/react";
import { useWalletStore } from "@/stores/wallet-store";
import { Button } from "@/components/ui/button";
import { WalletSelector } from "@/components/wallet/wallet-selector";
import { AccountDisplay } from "@/components/wallet/account-display";

export function ConnectButton() {
  const address = useWalletStore((s) => s.address);
  const isConnecting = useWalletStore((s) => s.isConnecting);
  const [selectorOpen, setSelectorOpen] = useState(false);

  if (address) {
    return <AccountDisplay />;
  }

  return (
    <>
      <Button onClick={() => setSelectorOpen(true)} disabled={isConnecting}>
        <Wallet size={16} weight="fill" />
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </Button>
      <WalletSelector open={selectorOpen} onOpenChange={setSelectorOpen} />
    </>
  );
}
