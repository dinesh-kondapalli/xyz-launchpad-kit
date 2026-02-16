#!/bin/bash
# deploy-cw20.sh - Deploy CW20 base contract to XYZ Chain
#
# This script downloads the pre-compiled CW20 base contract from CosmWasm/cw-plus
# and deploys it to the chain using xyzd. The resulting code ID should be configured
# in the xyz CLI with: xyz config set cw20-code-id <code_id>
#
# Requirements:
#   - xyzd binary (from ignite chain build)
#   - jq for JSON parsing
#   - curl for downloading
#   - A funded account to pay gas (default: alice)
#
# Usage:
#   ./scripts/deploy-cw20.sh
#   DEPLOYER_KEY=mykey ./scripts/deploy-cw20.sh

set -e

# Configuration
CW20_VERSION="v2.0.0"
CW20_WASM_URL="https://github.com/CosmWasm/cw-plus/releases/download/${CW20_VERSION}/cw20_base.wasm"
WASM_FILE="/tmp/cw20_base.wasm"

# Chain configuration
CHAIN_ID="${CHAIN_ID:-xyz-testnet-1}"
GAS_PRICES="${GAS_PRICES:-0.025uxyz}"

# Check dependencies
check_dependency() {
    if ! command -v "$1" &> /dev/null; then
        echo "Error: $1 not found. $2"
        exit 1
    fi
}

check_dependency "xyzd" "Build the chain first with 'ignite chain build'"
check_dependency "jq" "Install jq: brew install jq (macOS) or apt install jq (Linux)"
check_dependency "curl" "Install curl: brew install curl (macOS) or apt install curl (Linux)"

# Download CW20 wasm if not present or if --force flag is passed
if [ ! -f "$WASM_FILE" ] || [ "$1" = "--force" ]; then
    echo "Downloading CW20 base contract (${CW20_VERSION})..."
    curl -L -o "$WASM_FILE" "$CW20_WASM_URL"
    echo "Downloaded to $WASM_FILE"
fi

# Verify wasm file exists and has content
if [ ! -s "$WASM_FILE" ]; then
    echo "Error: WASM file is empty or missing"
    exit 1
fi

# Get deployer key (default: alice)
DEPLOYER_KEY="${DEPLOYER_KEY:-alice}"

echo ""
echo "=========================================="
echo "Deploying CW20 Base Contract"
echo "=========================================="
echo "Version:  $CW20_VERSION"
echo "Deployer: $DEPLOYER_KEY"
echo "Chain:    $CHAIN_ID"
echo "WASM:     $WASM_FILE"
echo ""

# Store the contract
echo "Storing contract on chain..."
RESULT=$(xyzd tx wasm store "$WASM_FILE" \
    --from "$DEPLOYER_KEY" \
    --gas auto \
    --gas-adjustment 1.3 \
    --gas-prices "$GAS_PRICES" \
    --chain-id "$CHAIN_ID" \
    --yes \
    --output json 2>&1)

# Check if transaction was submitted
if ! echo "$RESULT" | jq -e '.txhash' > /dev/null 2>&1; then
    echo "Error: Failed to submit transaction"
    echo "$RESULT"
    exit 1
fi

TX_HASH=$(echo "$RESULT" | jq -r '.txhash')
echo "Transaction submitted: $TX_HASH"

# Wait for transaction to be included
echo "Waiting for transaction to be included in a block..."
sleep 6

# Query the transaction to get code ID
echo "Querying transaction result..."
TX_RESULT=$(xyzd query tx "$TX_HASH" --output json 2>&1)

# Check for query error
if echo "$TX_RESULT" | grep -q "Error"; then
    echo "Error querying transaction. It may not be included yet."
    echo "Try running: xyzd query tx $TX_HASH"
    exit 1
fi

# Parse code ID from events
CODE_ID=$(echo "$TX_RESULT" | jq -r '.events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')

if [ -z "$CODE_ID" ] || [ "$CODE_ID" = "null" ]; then
    echo "Error: Could not parse code ID from transaction"
    echo ""
    echo "Transaction result:"
    echo "$TX_RESULT" | jq '.'
    exit 1
fi

echo ""
echo "=========================================="
echo "CW20 Contract Deployed Successfully!"
echo "=========================================="
echo ""
echo "Code ID: $CODE_ID"
echo ""
echo "Configure xyz CLI with:"
echo "  xyz config set cw20-code-id $CODE_ID"
echo ""
echo "To create a token, you will be able to use:"
echo "  xyz token create --name 'My Token' --symbol MTK --decimals 6"
echo ""
