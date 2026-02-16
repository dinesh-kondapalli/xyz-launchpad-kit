# Node.js Example

Demonstrates using the XYZ Chain SDK from Node.js to connect to the chain,
query balances, and sign transactions.

## Setup

1. Start local XYZ Chain:
   ```bash
   xyz localnet start
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. (Optional) Update `TEST_MNEMONIC` in `index.ts` with a valid genesis account mnemonic

4. Run:
   ```bash
   npm start
   ```

## What it demonstrates

- Creating a read-only client (`createClient`)
- Querying chain info (chain ID, block height)
- Querying account balance (`getBalance`)
- Creating a signing client from mnemonic (`createSigningClient`)
- Sending XYZ tokens (`sendXYZ`) - commented out, uncomment to test
