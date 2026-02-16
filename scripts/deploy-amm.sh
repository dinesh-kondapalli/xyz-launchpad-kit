#!/bin/bash
# deploy-amm.sh - Deploy or migrate AMM contract on XYZ Chain
#
# Handles two scenarios:
#   1. Fresh deploy: Stores WASM, instantiates with tokenlaunch module as authorized creator
#   2. Migration: Upgrades existing contract and adds tokenlaunch module to authorized_creators
#
# Requirements:
#   - xyzd binary (from ignite chain build)
#   - jq for JSON parsing
#   - AMM WASM built: cd contracts/amm && cargo wasm (or use optimizer)
#   - A funded admin account (default: alice)
#
# Usage:
#   ./scripts/deploy-amm.sh                    # Fresh deploy
#   ./scripts/deploy-amm.sh --migrate <addr>   # Migrate existing contract at <addr>
#
#   DEPLOYER_KEY=admin ./scripts/deploy-amm.sh
#   AMM_WASM=./artifacts/xyz_amm.wasm ./scripts/deploy-amm.sh

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────

CHAIN_ID="${CHAIN_ID:-xyz-testnet-1}"
GAS_PRICES="${GAS_PRICES:-0.025uxyz}"
DEPLOYER_KEY="${DEPLOYER_KEY:-alice}"
SWAP_FEE_BPS="${SWAP_FEE_BPS:-100}"  # 1% base swap fee

# AMM WASM location - try optimized artifacts first, then debug build
AMM_WASM="${AMM_WASM:-}"
if [ -z "$AMM_WASM" ]; then
    if [ -f "$(dirname "$0")/../artifacts/xyz_amm.wasm" ]; then
        AMM_WASM="$(dirname "$0")/../artifacts/xyz_amm.wasm"
    elif [ -f "$(dirname "$0")/../contracts/amm/target/wasm32-unknown-unknown/release/xyz_amm.wasm" ]; then
        AMM_WASM="$(dirname "$0")/../contracts/amm/target/wasm32-unknown-unknown/release/xyz_amm.wasm"
    fi
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Helpers ──────────────────────────────────────────────────────────────────

log_info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_dependency() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 not found. $2"
        exit 1
    fi
}

wait_for_tx() {
    local tx_hash="$1"
    local max_wait=30
    local elapsed=0

    while [ $elapsed -lt $max_wait ]; do
        sleep 3
        elapsed=$((elapsed + 3))
        if xyzd query tx "$tx_hash" --output json 2>/dev/null | jq -e '.code' > /dev/null 2>&1; then
            TX_RESULT=$(xyzd query tx "$tx_hash" --output json 2>&1)
            local code
            code=$(echo "$TX_RESULT" | jq -r '.code')
            if [ "$code" = "0" ]; then
                return 0
            else
                local raw_log
                raw_log=$(echo "$TX_RESULT" | jq -r '.raw_log // "unknown error"')
                log_error "Transaction failed (code $code): $raw_log"
                return 1
            fi
        fi
    done
    log_error "Transaction not found after ${max_wait}s"
    return 1
}

get_tokenlaunch_module_addr() {
    # Try querying the module account directly
    local addr
    addr=$(xyzd query auth module-account tokenlaunch -o json 2>/dev/null | jq -r '.account.base_account.address // .account.address // empty' 2>/dev/null)

    if [ -n "$addr" ] && [ "$addr" != "null" ]; then
        echo "$addr"
        return 0
    fi

    # Fallback: derive from module name using debug addr
    addr=$(xyzd debug addr tokenlaunch 2>/dev/null | grep -oE 'xyz1[a-z0-9]+' | head -1)

    if [ -n "$addr" ]; then
        echo "$addr"
        return 0
    fi

    log_error "Could not determine tokenlaunch module address."
    log_error "Start the chain first (ignite chain serve) and retry."
    return 1
}

# ─── Pre-flight ───────────────────────────────────────────────────────────────

check_dependency "xyzd" "Build the chain first with 'ignite chain build'"
check_dependency "jq" "Install jq: brew install jq (macOS) or apt install jq (Linux)"

# Parse arguments
MIGRATE_ADDR=""
if [ "${1:-}" = "--migrate" ]; then
    MIGRATE_ADDR="${2:-}"
    if [ -z "$MIGRATE_ADDR" ]; then
        log_error "Usage: $0 --migrate <amm_contract_address>"
        exit 1
    fi
fi

echo ""
echo "=========================================="
echo "  AMM Contract Deploy / Migrate"
echo "=========================================="
echo ""

# ─── Get tokenlaunch module address ──────────────────────────────────────────

log_info "Resolving tokenlaunch module address..."
TOKENLAUNCH_ADDR=$(get_tokenlaunch_module_addr)
log_ok "Tokenlaunch module: $TOKENLAUNCH_ADDR"

# ─── Store WASM ───────────────────────────────────────────────────────────────

if [ -z "$AMM_WASM" ] || [ ! -f "$AMM_WASM" ]; then
    log_error "AMM WASM not found. Build it first:"
    echo "  cd contracts/amm && cargo wasm"
    echo "  # or set AMM_WASM=/path/to/xyz_amm.wasm"
    exit 1
fi

log_info "Storing AMM contract on chain..."
log_info "WASM: $AMM_WASM"
log_info "Deployer: $DEPLOYER_KEY"

STORE_RESULT=$(xyzd tx wasm store "$AMM_WASM" \
    --from "$DEPLOYER_KEY" \
    --gas auto \
    --gas-adjustment 1.3 \
    --gas-prices "$GAS_PRICES" \
    --chain-id "$CHAIN_ID" \
    --yes \
    --output json 2>&1)

STORE_TX=$(echo "$STORE_RESULT" | jq -r '.txhash')
if [ -z "$STORE_TX" ] || [ "$STORE_TX" = "null" ]; then
    log_error "Failed to submit store transaction"
    echo "$STORE_RESULT"
    exit 1
fi

log_info "Store TX: $STORE_TX"
log_info "Waiting for confirmation..."

if ! wait_for_tx "$STORE_TX"; then
    exit 1
fi

CODE_ID=$(echo "$TX_RESULT" | jq -r '.events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')
if [ -z "$CODE_ID" ] || [ "$CODE_ID" = "null" ]; then
    log_error "Could not parse code ID from store transaction"
    echo "$TX_RESULT" | jq '.'
    exit 1
fi

log_ok "AMM code stored. Code ID: $CODE_ID"

# ─── Migrate or Instantiate ──────────────────────────────────────────────────

if [ -n "$MIGRATE_ADDR" ]; then
    # ── Migration path ────────────────────────────────────────────────────────
    echo ""
    log_info "Migrating existing AMM contract at: $MIGRATE_ADDR"
    log_info "Adding tokenlaunch module to authorized_creators..."

    MIGRATE_MSG="{\"add_authorized_creator\":\"$TOKENLAUNCH_ADDR\"}"

    MIGRATE_RESULT=$(xyzd tx wasm migrate "$MIGRATE_ADDR" "$CODE_ID" "$MIGRATE_MSG" \
        --from "$DEPLOYER_KEY" \
        --gas auto \
        --gas-adjustment 1.3 \
        --gas-prices "$GAS_PRICES" \
        --chain-id "$CHAIN_ID" \
        --yes \
        --output json 2>&1)

    MIGRATE_TX=$(echo "$MIGRATE_RESULT" | jq -r '.txhash')
    if [ -z "$MIGRATE_TX" ] || [ "$MIGRATE_TX" = "null" ]; then
        log_error "Failed to submit migrate transaction"
        echo "$MIGRATE_RESULT"
        exit 1
    fi

    log_info "Migrate TX: $MIGRATE_TX"
    log_info "Waiting for confirmation..."

    if ! wait_for_tx "$MIGRATE_TX"; then
        exit 1
    fi

    log_ok "Migration complete!"
    AMM_CONTRACT_ADDR="$MIGRATE_ADDR"

else
    # ── Fresh instantiation path ──────────────────────────────────────────────
    echo ""
    log_info "Instantiating new AMM contract..."

    # Get deployer address for authorized_creators
    DEPLOYER_ADDR=$(xyzd keys show "$DEPLOYER_KEY" -a 2>/dev/null)
    if [ -z "$DEPLOYER_ADDR" ]; then
        log_error "Could not resolve deployer address for key: $DEPLOYER_KEY"
        exit 1
    fi

    INIT_MSG="{\"authorized_creators\":[\"$DEPLOYER_ADDR\",\"$TOKENLAUNCH_ADDR\"],\"swap_fee_bps\":$SWAP_FEE_BPS}"

    log_info "Init msg: $INIT_MSG"

    INIT_RESULT=$(xyzd tx wasm instantiate "$CODE_ID" "$INIT_MSG" \
        --label "xyz-amm" \
        --admin "$DEPLOYER_ADDR" \
        --from "$DEPLOYER_KEY" \
        --gas auto \
        --gas-adjustment 1.3 \
        --gas-prices "$GAS_PRICES" \
        --chain-id "$CHAIN_ID" \
        --yes \
        --output json 2>&1)

    INIT_TX=$(echo "$INIT_RESULT" | jq -r '.txhash')
    if [ -z "$INIT_TX" ] || [ "$INIT_TX" = "null" ]; then
        log_error "Failed to submit instantiate transaction"
        echo "$INIT_RESULT"
        exit 1
    fi

    log_info "Instantiate TX: $INIT_TX"
    log_info "Waiting for confirmation..."

    if ! wait_for_tx "$INIT_TX"; then
        exit 1
    fi

    AMM_CONTRACT_ADDR=$(echo "$TX_RESULT" | jq -r '.events[] | select(.type=="instantiate") | .attributes[] | select(.key=="_contract_address") | .value')
    if [ -z "$AMM_CONTRACT_ADDR" ] || [ "$AMM_CONTRACT_ADDR" = "null" ]; then
        log_error "Could not parse contract address from instantiate transaction"
        echo "$TX_RESULT" | jq '.'
        exit 1
    fi

    log_ok "AMM contract instantiated!"
fi

# ─── Verify config ────────────────────────────────────────────────────────────

echo ""
log_info "Verifying AMM config..."

CONFIG_RESULT=$(xyzd query wasm contract-state smart "$AMM_CONTRACT_ADDR" '{"config":{}}' -o json 2>&1)
AUTHORIZED=$(echo "$CONFIG_RESULT" | jq -r '.data.authorized_creators[]' 2>/dev/null)

echo ""
echo "  Authorized creators:"
echo "$AUTHORIZED" | while read -r addr; do
    if [ "$addr" = "$TOKENLAUNCH_ADDR" ]; then
        echo -e "    ${GREEN}$addr${NC} (tokenlaunch module)"
    else
        echo -e "    $addr"
    fi
done

# Check tokenlaunch is authorized
if echo "$AUTHORIZED" | grep -q "$TOKENLAUNCH_ADDR"; then
    log_ok "Tokenlaunch module is authorized for pool creation"
else
    log_error "Tokenlaunch module NOT found in authorized_creators!"
    exit 1
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "=========================================="
echo "  AMM Deployment Complete"
echo "=========================================="
echo ""
echo "  Contract address: $AMM_CONTRACT_ADDR"
echo "  Code ID:          $CODE_ID"
echo "  Swap fee:         ${SWAP_FEE_BPS} bps ($(echo "scale=1; $SWAP_FEE_BPS / 100" | bc)%)"
echo ""
echo "  Configure tokenlaunch module:"
echo "    xyzd tx tokenlaunch update-params \\"
echo "      --amm-contract-address $AMM_CONTRACT_ADDR \\"
echo "      --cw20-code-id <cw20_code_id> \\"
echo "      --from <admin> --chain-id $CHAIN_ID"
echo ""
