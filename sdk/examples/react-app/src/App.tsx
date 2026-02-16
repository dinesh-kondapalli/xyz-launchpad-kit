import { useState, useEffect } from "react";
import {
  createClient,
  showWalletModal,
  getBalance,
  formatXYZ,
  type XYZClient,
  type WalletConnection,
} from "@xyz-chain/sdk";

const RPC_ENDPOINT = "http://localhost:26657";

function App() {
  const [client, setClient] = useState<XYZClient | null>(null);
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [balance, setBalance] = useState<string>("");
  const [chainInfo, setChainInfo] = useState<{
    chainId: string;
    height: number;
  } | null>(null);
  const [error, setError] = useState<string>("");

  // Initialize client on mount
  useEffect(() => {
    let mounted = true;
    let clientRef: XYZClient | null = null;

    async function init() {
      try {
        const c = await createClient({ rpcEndpoint: RPC_ENDPOINT });
        clientRef = c;
        if (!mounted) {
          c.disconnect();
          return;
        }
        setClient(c);
        const chainId = await c.getChainId();
        const height = await c.getHeight();
        if (mounted) {
          setChainInfo({ chainId, height });
        }
      } catch (e) {
        if (mounted) {
          setError(`Failed to connect: ${e}`);
        }
      }
    }
    init();

    return () => {
      mounted = false;
      clientRef?.disconnect();
    };
  }, []);

  // Fetch balance when wallet connects
  useEffect(() => {
    async function fetchBalance() {
      if (client && wallet) {
        try {
          const bal = await getBalance(client, wallet.address);
          setBalance(formatXYZ(bal.amount));
        } catch (e) {
          setError(`Failed to fetch balance: ${e}`);
        }
      }
    }
    fetchBalance();
  }, [client, wallet]);

  const handleConnect = async () => {
    try {
      setError("");
      const connection = await showWalletModal({
        rpcEndpoint: RPC_ENDPOINT,
      });
      if (connection) {
        setWallet(connection);
      }
    } catch (e) {
      setError(`Connection failed: ${e}`);
    }
  };

  const handleDisconnect = () => {
    wallet?.disconnect();
    setWallet(null);
    setBalance("");
  };

  return (
    <div className="app">
      <header>
        <h1>XYZ Chain SDK Demo</h1>
        {chainInfo && (
          <p className="chain-info">
            Connected to {chainInfo.chainId} | Block #{chainInfo.height}
          </p>
        )}
      </header>

      <main>
        {error && <div className="error">{error}</div>}

        {!wallet ? (
          <button onClick={handleConnect} className="connect-btn">
            Connect Wallet
          </button>
        ) : (
          <div className="wallet-info">
            <div className="address">
              <strong>Address:</strong> {wallet.address}
            </div>
            <div className="balance">
              <strong>Balance:</strong> {balance} XYZ
            </div>
            <button onClick={handleDisconnect} className="disconnect-btn">
              Disconnect
            </button>
          </div>
        )}
      </main>

      <footer>
        <p>
          Built with{" "}
          <a href="https://github.com/xyz-chain/sdk" target="_blank">
            @xyz-chain/sdk
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;
