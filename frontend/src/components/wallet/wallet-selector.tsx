"use client";

import { useCallback, useEffect, useState } from "react";
import { isKeplrAvailable, isLeapAvailable, isXYZAvailable, type WalletType } from "@xyz-chain/sdk";
import { useWalletStore } from "@/stores/wallet-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface WalletSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WalletSelector({ open, onOpenChange }: WalletSelectorProps) {
  const connect = useWalletStore((s) => s.connect);
  const isConnecting = useWalletStore((s) => s.isConnecting);
  const error = useWalletStore((s) => s.error);

  const [keplrAvailable, setKeplrAvailable] = useState(false);
  const [leapAvailable, setLeapAvailable] = useState(false);
  const [xyzAvailable, setXYZAvailable] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonic, setMnemonic] = useState("");

  useEffect(() => {
    if (open) {
      setKeplrAvailable(isKeplrAvailable());
      setLeapAvailable(isLeapAvailable());
      setXYZAvailable(isXYZAvailable());
      setShowMnemonic(false);
      setMnemonic("");
    }
  }, [open]);

  const handleConnect = useCallback(
    async (type: WalletType, mnemonicValue?: string) => {
      await connect(type, mnemonicValue);
      const state = useWalletStore.getState();
      if (!state.error) {
        onOpenChange(false);
      }
    },
    [connect, onOpenChange]
  );

  const handleDirectConnect = useCallback(async () => {
    if (!mnemonic.trim()) return;
    await handleConnect("direct", mnemonic.trim());
  }, [mnemonic, handleConnect]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Select a wallet to connect to XYZ Chain.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Button
            variant="outline"
            size="lg"
            className="justify-between h-14 text-base"
            disabled={!keplrAvailable || isConnecting}
            onClick={() => handleConnect("keplr")}
          >
            <span>Keplr</span>
            {!keplrAvailable && (
              <span className="text-xs text-muted-foreground">Not installed</span>
            )}
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="justify-between h-14 text-base"
            disabled={!leapAvailable || isConnecting}
            onClick={() => handleConnect("leap")}
          >
            <span>Leap</span>
            {!leapAvailable && (
              <span className="text-xs text-muted-foreground">Not installed</span>
            )}
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="justify-between h-14 text-base"
            disabled={!xyzAvailable || isConnecting}
            onClick={() => handleConnect("xyz")}
          >
            <span>XYZ Wallet</span>
            {!xyzAvailable && (
              <span className="text-xs text-muted-foreground">Not installed</span>
            )}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                or
              </span>
            </div>
          </div>

          {!showMnemonic ? (
            <Button
              variant="outline"
              size="lg"
              className="justify-between h-14 text-base"
              disabled={isConnecting}
              onClick={() => setShowMnemonic(true)}
            >
              <span>Test Wallet</span>
              <span className="text-xs text-muted-foreground">Mnemonic</span>
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                rows={3}
                placeholder="Enter mnemonic phrase..."
                value={mnemonic}
                onChange={(e) => setMnemonic(e.target.value)}
                disabled={isConnecting}
              />
              <Button
                size="sm"
                disabled={!mnemonic.trim() || isConnecting}
                onClick={handleDirectConnect}
              >
                Connect
              </Button>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        {isConnecting && (
          <p className="text-sm text-muted-foreground text-center">
            Connecting...
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
