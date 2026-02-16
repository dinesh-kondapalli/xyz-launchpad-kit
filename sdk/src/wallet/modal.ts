import type { WalletConnection, WalletType } from "./types.js";
import { getAvailableWallets } from "./detect.js";
import { connectKeplr, KEPLR_ICON } from "./keplr.js";
import { connectLeap, LEAP_ICON } from "./leap.js";
import { connectXYZ, XYZ_ICON } from "./xyz.js";

export interface WalletModalOptions {
  rpcEndpoint: string;
  restEndpoint?: string;
  chainId?: string;
  suggestChain?: boolean;
}

interface WalletOption {
  type: WalletType;
  name: string;
  icon: string;
  available: boolean;
}

const WALLET_CONFIG: Record<WalletType, { name: string; icon: string }> = {
  keplr: { name: "Keplr", icon: KEPLR_ICON },
  leap: { name: "Leap", icon: LEAP_ICON },
  direct: { name: "Direct", icon: "" },
  xyz: { name: "XYZ Wallet", icon: XYZ_ICON },
};

/**
 * Show wallet selection modal and connect to selected wallet
 * Returns null if user cancels
 */
export async function showWalletModal(
  options: WalletModalOptions
): Promise<WalletConnection | null> {
  // Check environment
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("showWalletModal requires a browser environment");
  }

  const availableWallets = getAvailableWallets();

  return new Promise((resolve) => {
    // Create modal elements
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
    `;

    const modal = document.createElement("div");
    modal.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      min-width: 320px;
      max-width: 400px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
    `;

    const title = document.createElement("h2");
    title.textContent = "Connect Wallet";
    title.style.cssText = `
      margin: 0 0 20px 0;
      font-size: 20px;
      font-weight: 600;
      color: #1a1a1a;
    `;
    modal.appendChild(title);

    const walletList = document.createElement("div");
    walletList.style.cssText = `display: flex; flex-direction: column; gap: 12px;`;

    const wallets: WalletOption[] = [
      { type: "keplr", ...WALLET_CONFIG.keplr, available: availableWallets.includes("keplr") },
      { type: "leap", ...WALLET_CONFIG.leap, available: availableWallets.includes("leap") },
      { type: "xyz", ...WALLET_CONFIG.xyz, available: availableWallets.includes("xyz") },
    ];

    const cleanup = () => {
      document.body.removeChild(overlay);
    };

    wallets.forEach((wallet) => {
      const button = document.createElement("button");
      button.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border: 1px solid ${wallet.available ? "#e5e5e5" : "#f0f0f0"};
        border-radius: 8px;
        background: ${wallet.available ? "white" : "#f9f9f9"};
        cursor: ${wallet.available ? "pointer" : "not-allowed"};
        opacity: ${wallet.available ? "1" : "0.5"};
        transition: border-color 0.2s, background 0.2s;
        font-size: 16px;
        color: #1a1a1a;
      `;

      if (wallet.available) {
        button.onmouseover = () => {
          button.style.borderColor = "#3B82F6";
          button.style.background = "#f8faff";
        };
        button.onmouseout = () => {
          button.style.borderColor = "#e5e5e5";
          button.style.background = "white";
        };
      }

      const icon = document.createElement("span");
      icon.innerHTML = wallet.icon;
      icon.style.cssText = `width: 32px; height: 32px;`;
      icon.querySelector("svg")?.setAttribute("width", "32");
      icon.querySelector("svg")?.setAttribute("height", "32");

      const name = document.createElement("span");
      name.textContent = wallet.name;
      name.style.cssText = `flex: 1; text-align: left; font-weight: 500;`;

      const status = document.createElement("span");
      status.textContent = wallet.available ? "" : "Not installed";
      status.style.cssText = `font-size: 12px; color: #888;`;

      button.appendChild(icon);
      button.appendChild(name);
      button.appendChild(status);

      if (wallet.available) {
        button.onclick = async () => {
          try {
            button.textContent = "Connecting...";
            button.disabled = true;

            const connectFn = wallet.type === "keplr" ? connectKeplr
                            : wallet.type === "leap" ? connectLeap
                            : connectXYZ;
            const connection = await connectFn(options);

            cleanup();
            resolve(connection);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Connection failed";
            button.textContent = errorMsg;
            setTimeout(() => {
              button.textContent = "";
              button.appendChild(icon);
              button.appendChild(name);
              button.appendChild(status);
              button.disabled = false;
            }, 2000);
          }
        };
      }

      walletList.appendChild(button);
    });

    modal.appendChild(walletList);

    // Cancel button
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `
      margin-top: 16px;
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 8px;
      background: #f0f0f0;
      cursor: pointer;
      font-size: 14px;
      color: #666;
    `;
    cancelBtn.onmouseover = () => { cancelBtn.style.background = "#e5e5e5"; };
    cancelBtn.onmouseout = () => { cancelBtn.style.background = "#f0f0f0"; };
    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };
    modal.appendChild(cancelBtn);

    // Click outside to cancel
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    };

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}
