#!/usr/bin/env -S npx tsx
/**
 * drill-rescue-harness.mjs
 *
 * Wave 9 — Issue #199: Automate an operator recovery drill (rescue phase)
 *
 * scripts/rescue-stealth-funds.ts defines a full CLI (via Commander) but
 * never actually invokes it — there is no `main().catch(...)` or
 * `program.parse()` call at the bottom of the file, so running it directly
 * exits silently with code 0 and no output. This is documented as finding
 * #3 in drills/2026-09-28-operator-recovery.md and should be fixed in that
 * file directly, in its own PR.
 *
 * Rather than depend on that unfixed entry point (or patch a third party's
 * script as part of an automated drill), this harness imports the module's
 * own exported functions directly and drives them in sequence. This lets
 * the drill exercise the actual documented rescue logic — recompute stealth
 * address, check whether funds already moved, build the announcement
 * payload, broadcast it — end to end and capture evidence, without
 * depending on unfixed upstream code.
 *
 * It also surfaces, inline, the other two known defects as they occur:
 *   - the derived `stealth:<hex>` address format is not Horizon-queryable,
 *     so the "refuses if funds already moved" safety check can never
 *     actually fire (finding #1)
 *   - the broadcast step is a local simulation, not a real Soroban
 *     transaction (finding #2)
 *
 * Usage (from the `stellar/` directory, as called by
 * drill-operator-recovery.sh):
 *   DRILL_ANNOUNCER_ID=<contract id> npx tsx ../scripts/drill-rescue-harness.mjs
 */

import {
  recomputeStealthAddress,
  hasFundsBeenMoved,
  buildAnnouncementPayload,
  broadcastAnnouncement,
} from '../scripts/rescue-stealth-funds.ts';

const EPHEMERAL_KEY = '1'.repeat(64); // 32 bytes hex — drill value, not a real key
const META_ADDRESS = '2'.repeat(128); // 64 bytes hex — drill value, not a real meta-address
const ANNOUNCER_ID =
  process.env.DRILL_ANNOUNCER_ID ??
  (() => {
    throw new Error('DRILL_ANNOUNCER_ID env var is required');
  })();
const RPC = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = 'Test SDF Future Network ; October 2022';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function main() {
  log('rescue harness: recomputing stealth address from ephemeral key + meta-address');
  const { stealthAddress, sharedSecretHex } = recomputeStealthAddress(EPHEMERAL_KEY, META_ADDRESS);
  log(`  stealthAddress: ${stealthAddress}`);
  log(`  sharedSecret (truncated): ${sharedSecretHex.slice(0, 16)}...`);

  log('rescue harness: checking whether funds already moved (safety check)');
  const moved = await hasFundsBeenMoved(stealthAddress, '100', RPC);
  log(`  hasFundsBeenMoved result: ${moved}`);
  if (stealthAddress.startsWith('stealth:')) {
    log(
      '  KNOWN DEFECT #1: this address format is not a Horizon-queryable G... ' +
        'account, so the result above is not a real check — it will always ' +
        'be false regardless of actual on-chain balance.',
    );
  }

  const inputs = {
    ephemeralKey: EPHEMERAL_KEY,
    recipientMetaAddress: META_ADDRESS,
    amount: '100',
    asset: 'XLM',
    announcerId: ANNOUNCER_ID,
    rpc: RPC,
    networkPassphrase: NETWORK_PASSPHRASE,
  };

  log('rescue harness: building announcement payload');
  const payload = buildAnnouncementPayload(inputs, stealthAddress);
  log(`  payload: ${JSON.stringify(payload)}`);

  log(
    'rescue harness: broadcasting — KNOWN DEFECT #2: this is a local ' +
      'simulation, not a real Soroban submission; no on-chain announcement ' +
      'is actually made',
  );
  const txHash = await broadcastAnnouncement(
    payload,
    inputs.announcerId,
    inputs.rpc,
    inputs.networkPassphrase,
  );
  log(`  simulated hash: ${txHash}`);
  log('rescue harness complete (simulated only — see defects above).');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
