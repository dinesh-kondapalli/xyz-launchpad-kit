# XYZ Launchpad + AMM Kit

A token launchpad with bonding curves and automatic AMM graduation, built on CosmWasm for the XYZ chain.

## What's Inside

```
├── frontend/           Next.js app (React 19, TailwindCSS 4, shadcn/ui)
├── sdk/                TypeScript SDK (@xyz-chain/sdk)
├── contracts/
│   ├── launchpad/      Bonding curve contract (Rust/CosmWasm) + compiled .wasm
│   └── amm/            AMM contract (Rust/CosmWasm) + compiled .wasm
├── scripts/            Deployment scripts
└── API-REFERENCE.md    Full contract endpoint documentation
```

## Prerequisites

- **Node.js** >= 18
- **npm** (or yarn/pnpm)
- A Keplr-compatible wallet for interacting with the frontend

## Quick Start

### 1. Build the SDK

The frontend depends on the SDK as a local package (`file:../sdk`).

```bash
cd sdk
npm install
npm run build
cd ..
```

### 2. Configure Environment

Copy the example env file and fill in your values:

```bash
cp frontend/.env.example frontend/.env.local
```

Edit `frontend/.env.local` with your chain endpoints and contract addresses.

### 3. Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_RPC_ENDPOINT` | Chain RPC endpoint | `http://67.205.164.156:26657` |
| `NEXT_PUBLIC_REST_ENDPOINT` | Chain REST/LCD endpoint | `http://67.205.164.156:1317` |
| `NEXT_PUBLIC_CHAIN_ID` | Chain ID | `xyz-testnet-1` |
| `NEXT_PUBLIC_LAUNCHPAD_CONTRACT` | Launchpad contract address | `xyz1...` |
| `NEXT_PUBLIC_AMM_CONTRACT` | AMM contract address | `xyz1...` |
| `NEXT_PUBLIC_BACKEND_URL` | Backend API (optional) | `http://localhost:3001` |

## Testnet Info

- **Chain ID:** `xyz-testnet-1`
- **RPC:** `http://67.205.164.156:26657`
- **REST:** `http://67.205.164.156:1317`
- **Native denom:** `uxyz` (1 XYZ = 1,000,000 uxyz)

## How It Works

1. **Create Token** -- Anyone pays a creation fee to launch a new token on a bonding curve
2. **Buy/Sell on Curve** -- Tokens are bought/sold along a linear bonding curve; price rises as supply is purchased
3. **Graduate to AMM** -- When the curve accumulates 5M XYZ, it automatically migrates all liquidity to a constant-product AMM pool
4. **Trade on AMM** -- Post-graduation, all trading happens on the AMM with standard x*y=k mechanics

## Contract Compilation (Optional)

If you need to recompile the contracts, you'll need Rust and the CosmWasm toolchain:

```bash
# Install Rust + wasm target
rustup target add wasm32-unknown-unknown

# Install optimizer
cargo install cosmwasm-check

# Build (from contract directory)
cd contracts/launchpad
cargo build --release --target wasm32-unknown-unknown

# Or use the CosmWasm optimizer Docker image for reproducible builds
```

Pre-compiled `.wasm` files are included in each contract directory.

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/lib/contract-clients/launchpad.ts` | Launchpad contract client |
| `frontend/src/lib/contract-clients/amm.ts` | AMM contract client |
| `frontend/src/lib/contract-clients/types.ts` | TypeScript response types |
| `frontend/src/lib/chain-config.ts` | Chain endpoint configuration |
| `sdk/src/` | SDK source (CosmJS wrappers, signing, queries) |
| `contracts/launchpad/src/msg.rs` | Launchpad message definitions |
| `contracts/amm/src/msg.rs` | AMM message definitions |

## API Reference

See [API-REFERENCE.md](./API-REFERENCE.md) for complete contract endpoint documentation including all execute/query messages, response types, fee structure, and bonding curve formula.
