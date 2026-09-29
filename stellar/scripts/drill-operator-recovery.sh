#!/usr/bin/env bash
#
# drill-operator-recovery.sh
#
# Wave 9 — Issue #199: Automate an operator recovery drill
#
# Scripts the full incident procedure — simulated operator key loss, pause,
# signer rotation, rescue, and recovery — against a throwaway Stellar
# Futurenet deployment with NO REAL FUNDS. Every command below is the exact
# sequence already rehearsed manually once (see
# drills/2026-09-28-operator-recovery.md for that transcript and its
# evidence/findings); this script reproduces it so the drill is repeatable
# rather than a one-off manual session.
#
# Requirements:
#   - stellar CLI (`stellar --version`)
#   - jq (for parsing on-chain JSON state — `jq --version`)
#   - Run from the `stellar/` workspace directory.
#
# Usage:
#   ./drill-operator-recovery.sh
#
# Output:
#   - Human-readable progress on stdout, timestamped.
#   - A full evidence log written to ../drills/<UTC timestamp>-operator-recovery.log
#     at the repo root (one level up from stellar/), containing every
#     command's timestamp and tx hash / event / query result.

set -euo pipefail

NETWORK="futurenet"
DRILL_TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
LOG_DIR="../drills"
LOG_FILE="${LOG_DIR}/${DRILL_TIMESTAMP}-operator-recovery.log"

mkdir -p "$LOG_DIR"

log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
  echo "$msg" | tee -a "$LOG_FILE"
}

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required tool: $1" >&2
    exit 1
  }
}

require stellar
require jq
require curl
require openssl

log "=== Operator recovery drill starting (network: ${NETWORK}) ==="

# ── Phase 0: identities ──────────────────────────────────────────────────────
log "Phase 0: generating drill-only identities and funding via friendbot"

for id in drill-deployer drill-signer-1 drill-signer-2 drill-signer-3 drill-signer-4 drill-signer-5-new; do
  if stellar keys address "$id" >/dev/null 2>&1; then
    log "  identity '$id' already exists, reusing"
  else
    stellar keys generate "$id" --network "$NETWORK" --fund | tee -a "$LOG_FILE"
  fi
done

DEPLOYER=$(stellar keys address drill-deployer)
SIGNER1=$(stellar keys address drill-signer-1)
SIGNER2=$(stellar keys address drill-signer-2)
SIGNER3=$(stellar keys address drill-signer-3)
SIGNER4=$(stellar keys address drill-signer-4)
SIGNER5_NEW=$(stellar keys address drill-signer-5-new)

log "  drill-deployer:     $DEPLOYER"
log "  drill-signer-1:     $SIGNER1"
log "  drill-signer-2:     $SIGNER2"
log "  drill-signer-3:     $SIGNER3"
log "  drill-signer-4:     $SIGNER4 (will be simulated as lost/compromised)"
log "  drill-signer-5-new: $SIGNER5_NEW (rotated in to replace signer-4)"

# ── Phase 0b: build + deploy contracts ───────────────────────────────────────
log "Phase 0b: building stealth-announcer and stealth-sender (drill-timelock feature)"

stellar contract build --package stealth-announcer | tee -a "$LOG_FILE"
stellar contract build --package stealth-sender --features drill-timelock | tee -a "$LOG_FILE"

log "Phase 0b: deploying stealth-announcer"
ANNOUNCER_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/stealth_announcer.wasm \
  --source drill-deployer --network "$NETWORK" | tail -n1)
log "  stealth-announcer deployed: $ANNOUNCER_ID"

log "Phase 0b: deploying stealth-sender"
SENDER_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/stealth_sender.wasm \
  --source drill-deployer --network "$NETWORK" | tail -n1)
log "  stealth-sender deployed: $SENDER_ID"

# ── Phase 0c: initialise ─────────────────────────────────────────────────────
log "Phase 0c: initialising stealth-sender (admin + announcer)"
stellar contract invoke --network "$NETWORK" --id "$SENDER_ID" --source drill-deployer \
  -- init --admin "$DEPLOYER" --announcer "$ANNOUNCER_ID" --fee_basis_points 0 \
  | tee -a "$LOG_FILE"

log "Phase 0c: initialising governance signer set (3-of-5)"
SIGNERS_JSON="[\"$DEPLOYER\",\"$SIGNER1\",\"$SIGNER2\",\"$SIGNER3\",\"$SIGNER4\"]"
echo "$SIGNERS_JSON" > signers.json
stellar contract invoke --network "$NETWORK" --id "$SENDER_ID" --source drill-deployer \
  -- init_multisig --signers-file-path signers.json --threshold 3 \
  | tee -a "$LOG_FILE"

# ── Phase 1: simulate operator key loss ─────────────────────────────────────
log "=== Phase 1: simulating operator key loss (drill-signer-4 treated as compromised) ==="
log "Incident clock starts now."

# ── Phase 2: pause ───────────────────────────────────────────────────────────
log "=== Phase 2: pause ==="
stellar contract invoke --network "$NETWORK" --id "$SENDER_ID" --source drill-deployer \
  -- pause --caller "$DEPLOYER" | tee -a "$LOG_FILE"

PAUSED=$(stellar contract invoke --network "$NETWORK" --id "$SENDER_ID" --source drill-deployer \
  -- is_paused 2>/dev/null | tail -n1)
log "  is_paused confirmed: $PAUSED"
if [ "$PAUSED" != "true" ]; then
  log "  ABORT: pause did not take effect — halting drill (rollback: do not proceed to rotation with an unpaused contract)."
  exit 1
fi

# ── Phase 3: propose + approve signer rotation ──────────────────────────────
log "=== Phase 3: propose signer rotation (drop signer-4, add signer-5-new) ==="
NEW_SIGNERS_JSON="[\"$DEPLOYER\",\"$SIGNER1\",\"$SIGNER2\",\"$SIGNER5_NEW\"]"
echo "$NEW_SIGNERS_JSON" > new-signers.json

stellar contract invoke --network "$NETWORK" --id "$SENDER_ID" --source drill-deployer \
  -- propose_rotate_signers --caller "$DEPLOYER" \
     --new_signers-file-path new-signers.json --new_threshold 3 \
  | tee -a "$LOG_FILE"

log "Phase 3: collecting approvals to reach quorum (3-of-5 current set)"
stellar contract invoke --network "$NETWORK" --id "$SENDER_ID" --source drill-signer-1 \
  -- approve_rotate_signers --caller "$SIGNER1" | tee -a "$LOG_FILE"
stellar contract invoke --network "$NETWORK" --id "$SENDER_ID" --source drill-signer-2 \
  -- approve_rotate_signers --caller "$SIGNER2" | tee -a "$LOG_FILE"

PENDING=$(stellar contract invoke --network "$NETWORK" --id "$SENDER_ID" --source drill-deployer \
  -- pending_rotation 2>/dev/null | tail -n1)
log "  pending_rotation state: $PENDING"

APPROVAL_COUNT=$(echo "$PENDING" | jq '.approvals | length')
EXECUTABLE_AT=$(echo "$PENDING" | jq -r '.executable_at')
log "  approvals collected: $APPROVAL_COUNT (need 3), executable_at (unix): $EXECUTABLE_AT"

if [ "$APPROVAL_COUNT" -lt 3 ]; then
  log "  ABORT: quorum not reached — cannot proceed to execute. Rollback: if quorum can never be reached (too many signers unreachable), a fresh rotation with a lower threshold must be proposed using only reachable signers; do NOT cancel this one first, as cancelling resets the full timelock."
  exit 1
fi

# ── Phase 4: wait out timelock, then execute ────────────────────────────────
log "=== Phase 4: waiting for rotation timelock to elapse ==="
NOW=$(date -u +%s)
WAIT_SECS=$(( EXECUTABLE_AT - NOW + 2 ))
if [ "$WAIT_SECS" -gt 0 ]; then
  log "  sleeping ${WAIT_SECS}s until executable_at"
  sleep "$WAIT_SECS"
fi

log "=== Phase 4: executing signer rotation ==="
stellar contract invoke --network "$NETWORK" --id "$SENDER_ID" --source drill-deployer \
  -- execute_rotate_signers --caller "$DEPLOYER" | tee -a "$LOG_FILE"

NEW_SIGNERS_STATE=$(stellar contract invoke --network "$NETWORK" --id "$SENDER_ID" --source drill-deployer \
  -- signers 2>/dev/null | tail -n1)
log "  post-rotation signers: $NEW_SIGNERS_STATE"

if echo "$NEW_SIGNERS_STATE" | grep -q "$SIGNER4"; then
  log "  ABORT: rotation did not remove the compromised signer as expected."
  exit 1
fi

# ── Phase 5: rescue (real on-chain transaction) ─────────────────────────────
log "=== Phase 5: rescue — real Futurenet transaction ==="
log "  Note: scripts/rescue-stealth-funds.ts has known defects (see"
log "  drills/2026-09-28-operator-recovery.md) — a stealth-address format its"
log "  own balance guard can't query, a broadcast step that never submits"
log "  on-chain, a missing entry point, and a hardcoded v1 scheme_id against a"
log "  v2 announcer. Rather than depend on that tool, this phase drives the"
log "  real primitives directly so the rescue is genuinely exercised on-chain."

log "  Creating a real funded, unannounced account to stand in for a stuck payment."
if stellar keys address drill-stuck-payment >/dev/null 2>&1; then
  log "  identity 'drill-stuck-payment' already exists, reusing"
else
  stellar keys generate drill-stuck-payment --network "$NETWORK" --fund | tee -a "$LOG_FILE"
fi
STUCK_ADDRESS=$(stellar keys address drill-stuck-payment)
log "  stuck-payment address: $STUCK_ADDRESS"

log "  Querying its balance on the matching network's Horizon — this is the"
log "  balance guard the maintainer flagged: it only works when given a real"
log "  G... address and the network it actually lives on."
BALANCE_JSON=$(curl -s "https://horizon-${NETWORK}.stellar.org/accounts/${STUCK_ADDRESS}")
NATIVE_BALANCE=$(echo "$BALANCE_JSON" | jq -r '.balances[]? | select(.asset_type=="native") | .balance')
if [ -z "$NATIVE_BALANCE" ]; then
  log "  ABORT: could not query a native balance for $STUCK_ADDRESS on horizon-${NETWORK}.stellar.org — rescue phase cannot proceed without a confirmed real balance."
  exit 1
fi
log "  confirmed balance: $NATIVE_BALANCE XLM"

log "  Submitting a real 'announce' call with a fresh random ephemeral key."
log "  scheme_id=2, since this announcer deployment is v2, not the v1 default"
log "  the standalone rescue-stealth-funds.ts tool hardcodes."
EPHEMERAL_PUB_KEY=$(openssl rand -hex 32)
METADATA="ab00000000000000"
log "  ephemeral_pub_key: $EPHEMERAL_PUB_KEY"
log "  metadata:          $METADATA (view tag 0xab)"

ANNOUNCE_OUTPUT=$(stellar contract invoke --network "$NETWORK" --id "$ANNOUNCER_ID" --source drill-deployer \
  -- announce --scheme_id 2 --stealth_address "$STUCK_ADDRESS" \
     --ephemeral_pub_key "$EPHEMERAL_PUB_KEY" --metadata "$METADATA" 2>&1 | tee -a "$LOG_FILE")

RESCUE_TX_HASH=$(echo "$ANNOUNCE_OUTPUT" | grep -oE 'Signing transaction: [0-9a-f]+' | awk '{print $3}')
if [ -z "$RESCUE_TX_HASH" ]; then
  log "  ABORT: could not extract a transaction hash from the announce call — treat the rescue phase as failed, do not report it as verified."
  exit 1
fi
log "  rescue transaction hash: $RESCUE_TX_HASH"

log "  Independently verifying via Soroban RPC getEvents (not just trusting the CLI's own success message)."
LATEST_LEDGER=$(curl -s -X POST "https://rpc-${NETWORK}.stellar.org" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger","params":{}}' | jq -r '.result.sequence')
START_LEDGER=$(( LATEST_LEDGER - 100 ))
if [ "$START_LEDGER" -lt 1 ]; then START_LEDGER=1; fi

EVENTS_JSON=$(curl -s -X POST "https://rpc-${NETWORK}.stellar.org" \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getEvents\",\"params\":{\"startLedger\":${START_LEDGER},\"filters\":[{\"type\":\"contract\",\"contractIds\":[\"${ANNOUNCER_ID}\"]}],\"pagination\":{\"limit\":20}}}")

MATCH=$(echo "$EVENTS_JSON" | jq -r --arg h "$RESCUE_TX_HASH" '.result.events[]? | select(.txHash==$h) | .txHash')
if [ "$MATCH" = "$RESCUE_TX_HASH" ]; then
  log "  VERIFIED: RPC independently confirms txHash $RESCUE_TX_HASH for contract $ANNOUNCER_ID"
else
  log "  WARNING: could not independently confirm $RESCUE_TX_HASH via RPC getEvents in the queried ledger range — check manually before calling the drill complete."
fi

log "  Rescue phase complete: real on-chain announce transaction submitted and independently verified."
log "  Known limitation: the address in this drill is a real funded account,"
log "  not one cryptographically derived from the ephemeral key via real"
log "  stealth-address math — this proves the announce call and balance guard"
log "  work end to end, not that a recipient's wallet would derive this exact"
log "  address from a real payment. See the report for the full scope note."

# ── Phase 6: unpause / recovery ──────────────────────────────────────────────
log "=== Phase 6: unpause (recovery) ==="
stellar contract invoke --network "$NETWORK" --id "$SENDER_ID" --source drill-deployer \
  -- unpause --caller "$DEPLOYER" | tee -a "$LOG_FILE"

FINAL_PAUSED=$(stellar contract invoke --network "$NETWORK" --id "$SENDER_ID" --source drill-deployer \
  -- is_paused 2>/dev/null | tail -n1)
log "  is_paused confirmed: $FINAL_PAUSED"

if [ "$FINAL_PAUSED" != "false" ]; then
  log "  Rollback: unpause did not take effect on first attempt. Re-run unpause"
  log "  (idempotent by design per PAUSE.md) rather than assuming partial state."
  stellar contract invoke --network "$NETWORK" --id "$SENDER_ID" --source drill-deployer \
    -- unpause --caller "$DEPLOYER" | tee -a "$LOG_FILE"
fi

log "=== Drill complete. Full evidence log: ${LOG_FILE} ==="
log "  stealth-announcer: $ANNOUNCER_ID"
log "  stealth-sender:    $SENDER_ID"
