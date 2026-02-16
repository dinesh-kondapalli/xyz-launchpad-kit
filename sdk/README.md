# @xyz-chain/sdk

TypeScript SDK for building dApps on XYZ Chain. Works in browser and Node.js.

## Installation

```bash
npm install @xyz-chain/sdk
```

## Quick Start

### Connect to XYZ Chain

```typescript
import { createClient, getBalance, formatXYZ } from "@xyz-chain/sdk";

const client = await createClient({
  rpcEndpoint: "http://localhost:26657",
});

// Get chain info
const chainId = await client.getChainId();
const height = await client.getHeight();

// Query balance
const balance = await getBalance(client, "xyz1...");
console.log(formatXYZ(balance.amount), "XYZ");
```

### Connect Wallet (Browser)

```typescript
import { showWalletModal, getBalance } from "@xyz-chain/sdk";

// Show wallet selection modal (Keplr, Leap)
const wallet = await showWalletModal({
  rpcEndpoint: "http://localhost:26657",
});

if (wallet) {
  console.log("Connected:", wallet.address);
}
```

### Send Tokens

```typescript
import { createSigningClient, sendXYZ } from "@xyz-chain/sdk";

// From mnemonic (Node.js / CLI)
const client = await createSigningClient(
  { rpcEndpoint: "http://localhost:26657" },
  "your mnemonic here"
);

const result = await sendXYZ(client, "xyz1...recipient", "1000000");
console.log("TX:", result.transactionHash);
```

### Interact with Smart Contracts

```typescript
import {
  queryContract,
  executeContract,
  createContractClient,
} from "@xyz-chain/sdk";

// Query contract
const info = await queryContract(client, contractAddress, {
  token_info: {},
});

// Execute contract (with wallet)
const contractClient = await createContractClient(config, wallet);
const result = await executeContract(
  contractClient,
  wallet.address,
  contractAddress,
  { transfer: { recipient: "xyz1...", amount: "1000000" } }
);
```

## API Reference

### Client

- `createClient(config)` - Create read-only client
- `createSigningClient(config, mnemonic)` - Create signing client (Node.js)

### Queries

- `getBalance(client, address)` - Get native balance
- `getAllBalances(client, address)` - Get all balances
- `getTokenBalance(client, contract, address)` - Get CW20 balance
- `getTokenInfo(client, contract)` - Get CW20 token info

### Transactions

- `sendTokens(client, recipient, coins)` - Send native tokens
- `sendXYZ(client, recipient, amount)` - Send XYZ tokens

### Contracts

- `queryContract(client, address, msg)` - Query contract
- `executeContract(client, sender, address, msg)` - Execute contract
- `transferCW20(...)` - Transfer CW20 tokens
- `mintCW20(...)` - Mint CW20 tokens
- `burnCW20(...)` - Burn CW20 tokens

### Wallet

- `connectKeplr(options)` - Connect Keplr wallet
- `connectLeap(options)` - Connect Leap wallet
- `showWalletModal(options)` - Show wallet selection modal

## Examples

See the `examples/` directory:

- `examples/node-script/` - Node.js usage
- `examples/react-app/` - React browser app

## Requirements

- Node.js 18+
- Browser with Keplr or Leap extension (for wallet features)
- XYZ Chain node (local or testnet)

## License

MIT
