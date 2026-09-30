#!/bin/bash

# Stellar Deployment Script for Wraith Protocol
# Usage: ./deploy.sh [testnet|futurenet|mainnet] [secret-key-name] [--force] [--dry-run]

NETWORK=$1
IDENTITY=$2

if [[ -z "$NETWORK" || -z "$IDENTITY" ]]; then
    echo "Usage: ./deploy.sh <network> <identity> [--force] [--dry-run]"
    exit 1
fi

FORCE=0
DRY_RUN=0

for arg in "$@"; do
  if [[ "$arg" == "--force" ]]; then
    FORCE=1
  fi
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN=1
  fi
done

# Deployments are recorded in the repository-wide manifest (deployments/README.md).
RECORD_FILE="../deployments/stellar/stellar-${NETWORK}.json"
MANIFEST_TOOL="../scripts/deployment-manifest"

case "$NETWORK" in
    testnet)   DEFAULT_RPC="https://soroban-testnet.stellar.org" ;;
    futurenet) DEFAULT_RPC="https://rpc-futurenet.stellar.org" ;;
    *)         DEFAULT_RPC="" ;;
esac
RPC_URL="${RPC_URL:-$DEFAULT_RPC}"

if [[ -f "$RECORD_FILE" && $FORCE -eq 0 && $DRY_RUN -eq 0 ]]; then
    echo "Error: Deployment record $RECORD_FILE already exists."
    echo "Use --force to overwrite."
    exit 1
fi

if [[ -z "$RPC_URL" && $DRY_RUN -eq 0 ]]; then
    echo "Error: set RPC_URL for network $NETWORK (used to record deployment ledgers)."
    exit 1
fi

if [[ ! -d "$MANIFEST_TOOL/node_modules" && $DRY_RUN -eq 0 ]]; then
    echo "Error: run 'npm ci' in scripts/deployment-manifest first."
    exit 1
fi

echo "🚀 Deploying Wraith Protocol to $NETWORK using $IDENTITY..."

if [[ $DRY_RUN -eq 1 ]]; then
    echo "[DRY-RUN] Will execute: cargo build --target wasm32-unknown-unknown --release"
    echo "[DRY-RUN] Will execute: stellar contract optimize on all contracts"
    echo "[DRY-RUN] Will deploy: stealth-announcer"
    echo "[DRY-RUN] Will deploy: stealth-registry"
    echo "[DRY-RUN] Will deploy: stealth-sender"
    echo "[DRY-RUN] Will deploy: wraith-names"
    echo "[DRY-RUN] Will record deployment ledgers and wasm hashes to $RECORD_FILE"
    echo "[DRY-RUN] Will invoke: stealth-sender init"
    echo "[DRY-RUN] Will rebuild deployments/manifest.json"
    echo "[DRY-RUN] Will verify deployment status"
    exit 0
fi

# Build and optimize
echo "--- Building Contracts ---"
cargo build --target wasm32-unknown-unknown --release

echo "--- Optimizing Contracts ---"
# Optimize each contract
for contract in stealth_announcer stealth_registry stealth_sender wraith_names; do
    stellar contract optimize --wasm target/wasm32-unknown-unknown/release/${contract}.wasm
done

# The optimizer usually produces an optimized.wasm file or we can just use the original if not specified, 
# but stellar contract optimize by default creates a file in the same dir or `target/wasm32-unknown-unknown/release/${contract}.optimized.wasm`.
# Let's check if the optimized version exists, otherwise fallback to the standard release build.
get_wasm_path() {
    local base="target/wasm32-unknown-unknown/release/$1"
    if [[ -f "${base}.optimized.wasm" ]]; then
        echo "${base}.optimized.wasm"
    else
        echo "${base}.wasm"
    fi
}

ANNOUNCER_WASM=$(get_wasm_path "stealth_announcer")
REGISTRY_WASM=$(get_wasm_path "stealth_registry")
SENDER_WASM=$(get_wasm_path "stealth_sender")
NAMES_WASM=$(get_wasm_path "wraith_names")

# 1. Deploy stealth-announcer
echo "--- Deploying stealth-announcer ---"
ANNOUNCER_ID=$(soroban contract deploy \
    --wasm "$ANNOUNCER_WASM" \
    --source $IDENTITY \
    --network $NETWORK)
echo "✅ stealth-announcer: $ANNOUNCER_ID"

# 2. Deploy stealth-registry
echo "--- Deploying stealth-registry ---"
REGISTRY_ID=$(soroban contract deploy \
    --wasm "$REGISTRY_WASM" \
    --source $IDENTITY \
    --network $NETWORK)
echo "✅ stealth-registry: $REGISTRY_ID"

# 3. Deploy stealth-sender
echo "--- Deploying stealth-sender ---"
SENDER_ID=$(soroban contract deploy \
    --wasm "$SENDER_WASM" \
    --source $IDENTITY \
    --network $NETWORK)
echo "✅ stealth-sender: $SENDER_ID"

# 4. Deploy wraith-names
echo "--- Deploying wraith-names ---"
NAMES_ID=$(soroban contract deploy \
    --wasm "$NAMES_WASM" \
    --source $IDENTITY \
    --network $NETWORK)
echo "✅ wraith-names: $NAMES_ID"

# Record before init: the recorder takes each contract's deployment ledger from
# its instance entry, which init would modify.
echo "--- Recording Deployment ---"
DEPLOYER_PUBKEY=$(soroban keys address $IDENTITY)
STELLAR_DIR=$(pwd)
crate_version() {
    grep -m1 -E '^version' "$STELLAR_DIR/$1/Cargo.toml" | sed -E 's/.*"(.*)".*/\1/'
}
if (cd "$MANIFEST_TOOL" && npx tsx src/cli.ts record stellar \
    --network "stellar-${NETWORK}" \
    --rpc "$RPC_URL" \
    ${DEFAULT_RPC:+--public-rpc "$DEFAULT_RPC"} \
    --recorded-by deploy-script \
    --source-commit HEAD \
    --deployer "$DEPLOYER_PUBKEY" \
    --contract "stealth-announcer=$ANNOUNCER_ID" --wasm "stealth-announcer=$STELLAR_DIR/$ANNOUNCER_WASM" \
    --contract "stealth-registry=$REGISTRY_ID" --wasm "stealth-registry=$STELLAR_DIR/$REGISTRY_WASM" \
    --contract "stealth-sender=$SENDER_ID" --wasm "stealth-sender=$STELLAR_DIR/$SENDER_WASM" \
    --contract "wraith-names=$NAMES_ID" --wasm "wraith-names=$STELLAR_DIR/$NAMES_WASM" \
    --version "stealth-announcer=$(crate_version stealth-announcer)" \
    --version "stealth-registry=$(crate_version stealth-registry)" \
    --version "stealth-sender=$(crate_version stealth-sender)" \
    --version "wraith-names=$(crate_version wraith-names)"); then
    echo "✅ Recorded to $RECORD_FILE and rebuilt deployments/manifest.json"
    RECORD_FAILED=0
else
    # Keep going: the contracts are live and stealth-sender must still be initialized.
    echo "❌ Recording failed. Re-run the record command in scripts/deployment-manifest before committing."
    RECORD_FAILED=1
fi

# Initialize stealth-sender with announcer ID
echo "Initializing stealth-sender..."
soroban contract invoke \
    --id $SENDER_ID \
    --source $IDENTITY \
    --network $NETWORK \
    -- \
    init \
    --admin $IDENTITY \
    --announcer $ANNOUNCER_ID

# Verification step (optional but nice)
echo "--- Verifying Deployments ---"
echo "Checking stealth-sender admin..."
soroban contract invoke \
    --id $SENDER_ID \
    --source $IDENTITY \
    --network $NETWORK \
    -- \
    admin || echo "⚠️ Could not read admin"

echo ""
echo "🎉 Deployment Complete!"
echo "--------------------------------------"
echo "Announcer: $ANNOUNCER_ID"
echo "Registry:  $REGISTRY_ID"
echo "Sender:    $SENDER_ID"
echo "Names:     $NAMES_ID"
echo "--------------------------------------"

if [[ $RECORD_FAILED -eq 1 ]]; then
    echo "❌ Deployment succeeded but was not recorded in deployments/. See the error above."
    exit 1
fi
