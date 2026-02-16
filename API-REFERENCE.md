# API Reference: XYZ Launchpad + AMM Contracts

All contract interactions use CosmWasm JSON messages. Amounts are in **micro-units** (`uxyz` for the native token, 6 decimals for CW20 tokens). For example, `1 XYZ = 1,000,000 uxyz` and `1 TOKEN = 1,000,000 uTOKEN`.

The TypeScript client wrappers live in `frontend/src/lib/contract-clients/` and types in `types.ts`.

---

## Launchpad Contract

Contract address is configured via `NEXT_PUBLIC_LAUNCHPAD_CONTRACT` in `.env.local`.

### Execute Messages

#### `CreateToken`

Creates a new token with a bonding curve. Requires the creation fee in `uxyz` (query `Config` to get the current fee).

```json
{
  "create_token": {
    "name": "My Token",
    "symbol": "MYTKN",
    "image": "https://example.com/logo.png",
    "description": "A cool token",
    "social_links": ["https://twitter.com/mytoken"]
  }
}
```

**Funds required:** `[{ "denom": "uxyz", "amount": "<creation_fee>" }]`

**What happens:**
1. Creation fee is collected as initial XYZ reserves for the curve
2. A new CW20 token is instantiated with 1 billion total supply (6 decimals)
3. All tokens are held by the launchpad contract (released via buys)
4. A bonding curve is created and indexed by the new token address

**TS client:** `createToken(contractClient, senderAddress, params, creationFee)`

---

#### `Buy`

Buy tokens along the bonding curve by sending native XYZ.

```json
{
  "buy": {
    "token_address": "<cw20_token_address>",
    "min_tokens_out": "1000000"
  }
}
```

**Funds required:** `[{ "denom": "uxyz", "amount": "<xyz_to_spend>" }]`

**Slippage protection:** `min_tokens_out` -- transaction reverts if you'd receive fewer tokens.

**Fee:** 0.5% (50 bps) deducted from XYZ input before curve calculation. A portion goes to the token creator.

**Auto-graduation:** If this buy pushes `xyz_reserves >= graduation_threshold` (5M XYZ), the curve automatically graduates: the token migrates to the AMM with all remaining tokens and XYZ reserves as initial liquidity.

**TS client:** `buyTokens(contractClient, senderAddress, tokenAddress, xyzAmount, minTokensOut)`

---

#### `Sell` (via CW20 Send/Receive)

Sell tokens back to the bonding curve. **There is no direct `Sell` execute message.** You must use the CW20 Send pattern:

Send tokens to the launchpad contract address with an encoded `SellTokens` message:

```json
// CW20 Send message (sent to the TOKEN contract, not launchpad)
{
  "send": {
    "contract": "<launchpad_contract_address>",
    "amount": "1000000",
    "msg": "<base64_encoded_SellTokens>"
  }
}
```

The inner message (before base64 encoding):
```json
{
  "min_xyz_out": "500000"
}
```

**Slippage protection:** `min_xyz_out` -- transaction reverts if you'd receive less XYZ.

**Fee:** 3.5% (350 bps) deducted from XYZ output. Fee is split: 50% burned, 50% to LP (with creator getting a share of the LP portion).

**TS client:** `sellTokens(contractClient, senderAddress, tokenAddress, tokenAmount, minXyzOut)` -- handles the CW20 Send encoding automatically.

---

#### `Graduate`

Manually trigger graduation for a token that has reached the threshold. Permissionless -- anyone can call it.

```json
{
  "graduate": {
    "token_address": "<cw20_token_address>"
  }
}
```

**No funds required.**

**Note:** Graduation usually happens automatically during a `Buy`. This is a fallback for edge cases.

**What happens:**
1. Curve is marked as graduated (no more buys/sells on curve)
2. All XYZ reserves are sent to the AMM as initial pool liquidity
3. All unsold tokens are sent to the AMM as the token side of the pool
4. A new AMM pool is created with these reserves

---

### Query Messages

#### `Config`

Returns global launchpad configuration.

```json
{ "config": {} }
```

**Response (`ConfigResponse`):**
```typescript
{
  amm_contract: string;       // AMM contract address
  cw20_code_id: number;       // Code ID for CW20 token instantiation
  creation_fee: string;       // Token creation fee in uxyz (e.g. "80000000000")
  graduation_threshold: string; // XYZ threshold in uxyz (e.g. "5000000000000")
  buy_fee_bps: number;        // Buy fee in basis points (50 = 0.5%)
  sell_fee_bps: number;       // Sell fee in basis points (350 = 3.5%)
}
```

---

#### `Curve`

Get full curve info for a specific token.

```json
{ "curve": { "token_address": "<cw20_token_address>" } }
```

**Response (`CurveResponse`):**
```typescript
{
  token_address: string;
  metadata: {
    name: string;
    symbol: string;
    image: string;
    description: string;
    social_links: string[];
  };
  creator: string;
  tokens_sold: string;       // Tokens sold so far (micro-units)
  tokens_remaining: string;  // Tokens still available on curve
  xyz_reserves: string;      // XYZ locked in curve (micro-units)
  current_price: string;     // Current price as decimal string (e.g. "0.000015")
  graduated: boolean;
  created_at: number;        // Block height
}
```

---

#### `AllCurves`

Paginated listing of all active bonding curves.

```json
{
  "all_curves": {
    "start_after": "<optional_token_address>",
    "limit": 10
  }
}
```

**Response (`AllCurvesResponse`):**
```typescript
{ curves: CurveResponse[] }
```

**Pagination:** Max 30 per page. Pass the last `token_address` from results as `start_after` to get the next page.

---

#### `Progress`

Graduation progress for a specific token.

```json
{ "progress": { "token_address": "<cw20_token_address>" } }
```

**Response (`ProgressResponse`):**
```typescript
{
  token_address: string;
  xyz_raised: string;            // Current XYZ in reserves
  graduation_threshold: string;  // Target XYZ amount
  progress_percent: string;      // e.g. "45.23%"
  tokens_sold: string;
  tokens_remaining: string;
  graduated: boolean;
}
```

---

#### `SimulateBuy`

Preview a buy without executing. Use for UI price display.

```json
{
  "simulate_buy": {
    "token_address": "<cw20_token_address>",
    "xyz_amount": "1000000"
  }
}
```

**Response (`SimulateBuyResponse`):**
```typescript
{
  tokens_out: string;    // Tokens you'd receive
  fee_amount: string;    // Fee deducted (in uxyz)
  new_price: string;     // Price after this trade
}
```

---

#### `SimulateSell`

Preview a sell without executing.

```json
{
  "simulate_sell": {
    "token_address": "<cw20_token_address>",
    "token_amount": "1000000"
  }
}
```

**Response (`SimulateSellResponse`):**
```typescript
{
  xyz_out: string;       // XYZ you'd receive
  fee_amount: string;    // Total fee (burned + LP)
  burned_amount: string; // Portion of fee that is burned
  new_price: string;     // Price after this trade
}
```

---

## AMM Contract

Contract address is configured via `NEXT_PUBLIC_AMM_CONTRACT` in `.env.local`.

Pools are created automatically when tokens graduate from the bonding curve. The AMM uses a **constant product (x*y=k)** formula.

### Execute Messages

#### `Swap` (XYZ -> Token)

Swap native XYZ for tokens.

```json
{
  "swap": {
    "token_address": "<cw20_token_address>",
    "offer_xyz": true,
    "min_output": "1000000"
  }
}
```

**Funds required:** `[{ "denom": "uxyz", "amount": "<xyz_to_swap>" }]`

**Slippage protection:** `min_output` -- reverts if output amount is less.

**TS client:** `swapXyzForToken(contractClient, senderAddress, tokenAddress, xyzAmount, minOutput)`

---

#### `Receive` (Token -> XYZ via CW20 Send)

Swap tokens for native XYZ. Uses the CW20 Send pattern (same as launchpad sells):

```json
// Sent to the TOKEN contract
{
  "send": {
    "contract": "<amm_contract_address>",
    "amount": "1000000",
    "msg": "<base64_encoded_SwapTokenForXyz>"
  }
}
```

Inner message (before base64):
```json
{
  "min_output": "500000"
}
```

**TS client:** `swapTokenForXyz(contractClient, senderAddress, tokenAddress, tokenAmount, minOutput)` -- handles encoding automatically.

---

#### `CreatePool` (Internal)

Only callable by authorized creators (the launchpad contract). Called automatically during graduation.

```json
{
  "create_pool": {
    "token_address": "<cw20_token_address>",
    "xyz_amount": "5000000000000",
    "token_amount": "200000000000000",
    "augmented_fee_bps": 100,
    "lp_target_uxyz": "20000000000000"
  }
}
```

**Note:** `augmented_fee_bps` and `lp_target_uxyz` are optional. If provided, the pool charges an extra fee until the pool value reaches the target, then the augmented fee auto-disables.

---

### Query Messages

#### `Pool`

Get pool info for a token.

```json
{ "pool": { "token_address": "<cw20_token_address>" } }
```

**Response (`PoolResponse`):**
```typescript
{
  token_address: string;
  xyz_reserve: string;      // XYZ in pool (micro-units)
  token_reserve: string;    // Tokens in pool (micro-units)
  lp_token_address: string; // LP token address (locked, non-transferable)
  lp_total_supply: string;  // LP token supply
  price: string;            // Current price: XYZ per token (decimal string)
}
```

---

#### `AllPools`

Paginated listing of all AMM pools.

```json
{
  "all_pools": {
    "start_after": "<optional_token_address>",
    "limit": 10
  }
}
```

**Response:** `{ pools: PoolResponse[] }` -- max 30 per page.

---

#### `SimulateSwap`

Preview a swap in either direction.

```json
{
  "simulate_swap": {
    "token_address": "<cw20_token_address>",
    "offer_xyz": true,
    "offer_amount": "1000000"
  }
}
```

Set `offer_xyz: true` for XYZ->Token, `false` for Token->XYZ.

**Response (`SimulateSwapResponse`):**
```typescript
{
  output_amount: string;         // Amount you'd receive
  fee_amount: string;            // Total fee
  price_impact: string;          // e.g. "0.53%"
  augmented_fee_amount: string;  // Portion from augmented fee (0 if inactive)
}
```

---

#### `Config`

```json
{ "config": {} }
```

**Response:**
```typescript
{
  authorized_creators: string[]; // Addresses allowed to create pools
  swap_fee_bps: number;          // Base swap fee (e.g. 100 = 1%)
}
```

---

#### `AugmentedFeeStatus`

Check the augmented fee status for a specific pool.

```json
{ "augmented_fee_status": { "token_address": "<cw20_token_address>" } }
```

**Response:**
```typescript
{
  active: boolean;                  // Whether augmented fee is currently active
  augmented_fee_bps: number;        // Extra fee in basis points
  lp_target_uxyz: string;           // Pool value target to auto-disable
  current_pool_value_uxyz: string;  // Current pool value (2 * xyz_reserve)
  progress_percent: string;         // e.g. "75.50"
}
```

---

## Reference: Bonding Curve Mechanics

### Linear Curve Formula

```
price(tokens_sold) = BASE_PRICE + SLOPE * tokens_sold
```

- **Base price:** 0.000015 XYZ per token (15 uxyz per token at start)
- **Slope:** 15 micro-XYZ per 10^12 tokens sold
- Price increases linearly as more tokens are bought

### Buy Calculation

Uses the integral of the linear curve (quadratic formula) to determine tokens received for a given XYZ input:

```
XYZ_input_after_fee = delta * (base + slope * t1) + slope * delta^2 / 2
```

Solved via quadratic formula for `delta` (tokens out).

### Sell Calculation

Reverse integral from `tokens_sold` back to `tokens_sold - tokens_input`:

```
XYZ_value = base * delta + slope * delta * (t1 + t2) / 2
```

### Token Supply

- **Total supply:** 100,000,000 tokens (100 million)
- **Decimals:** 6 (so 1 token = 1,000,000 micro-units)
- **Total in micro-units:** 1,000,000,000,000,000

### Fee Structure

| Fee | Rate | Details |
|-----|------|---------|
| Token creation | Fixed | Query `Config.creation_fee` (currently 80,000 XYZ) |
| Buy fee | 0.5% (50 bps) | Deducted from XYZ input before curve calc |
| Sell fee | 3.5% (350 bps) | Deducted from XYZ output; 50% burned, 50% to LP |
| Creator share | Configurable | Creator gets a share of buy fees and LP portion of sell fees |
| AMM swap fee | 1% (100 bps) | Constant product swap fee; stays in pool (auto-compounds) |
| Augmented fee | 0-5% | Optional extra fee on AMM swaps; auto-disables at target |

### Graduation Mechanics

1. **Threshold:** 5,000,000 XYZ (5M) in curve reserves triggers graduation
2. **Auto-trigger:** Happens automatically during a `Buy` that crosses the threshold
3. **Manual trigger:** Anyone can call `Graduate` if threshold is met
4. **Migration:** All XYZ reserves + all unsold tokens move to a new AMM pool
5. **Post-graduation:** Bonding curve is closed; all trading moves to the AMM

### AMM Constant Product Formula

```
output = output_reserve * input_after_fee / (input_reserve + input_after_fee)
```

Fees are deducted from input first. Fee revenue stays in the pool, increasing reserves for LP holders.

---

## TypeScript Types Quick Reference

All response types are defined in `frontend/src/lib/contract-clients/types.ts`.

| Type | Used By |
|------|---------|
| `CurveResponse` | Launchpad `Curve` query |
| `ProgressResponse` | Launchpad `Progress` query |
| `SimulateBuyResponse` | Launchpad `SimulateBuy` query |
| `SimulateSellResponse` | Launchpad `SimulateSell` query |
| `LaunchpadConfigResponse` | Launchpad `Config` query |
| `PoolResponse` | AMM `Pool` query |
| `SimulateSwapResponse` | AMM `SimulateSwap` query |

### Important: CW20 Send Pattern

Both selling on the launchpad and swapping Token->XYZ on the AMM use the **CW20 Send pattern**. You don't call the launchpad/AMM contract directly. Instead:

1. Call `Send` on the **CW20 token contract**
2. Pass the launchpad/AMM as the recipient
3. Include a base64-encoded inner message (`SellTokens` or `SwapTokenForXyz`)

The SDK's `sendCW20()` helper handles this encoding. See `frontend/src/lib/contract-clients/launchpad.ts` and `amm.ts` for usage.
