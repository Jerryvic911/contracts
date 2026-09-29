# Operator Recovery Drill: 2026-09-28

**Issue:** [wraith-protocol/contracts#199](https://github.com/wraith-protocol/contracts/issues/199), Automate an operator recovery drill
**Owner:** Jerry ([@Jerryvic911](https://github.com/Jerryvic911))
**Network:** Stellar Futurenet ("Test SDF Future Network ; October 2022")
**Funds at risk:** None. All accounts and contracts are drill-only, funded by friendbot.
**Reproduce:** `cd stellar && ./scripts/drill-operator-recovery.sh` (see [`docs/RECOVERY_DRILL.md`](../docs/RECOVERY_DRILL.md))

## Summary

This drill exercises, for the first time, the incident paths described in
`stellar/PAUSE.md` and `stellar/MULTISIG.md` together as one procedure against a
live futurenet deployment. Both docs previously carried a "not yet rehearsed"
notice for the signer-rotation flow.

The drill was first walked through by hand, then automated as
`stellar/scripts/drill-operator-recovery.sh`. The evidence below comes from a
full scripted run, which anyone can repeat. Full raw output is in
`drills/2026-09-28T21-40-49Z-operator-recovery.log`.

All required elements ran: **operator key loss (simulated), pause, signer
rotation, rescue, recovery.**

**Update, 2026-09-28 (post-review):** a maintainer asked for a real Futurenet
rescue transaction and a working balance guard, rather than the local
simulation this drill first shipped with. The rescue phase was rebuilt to
submit and independently verify a real on-chain transaction as an inline part
of the script itself (Phase 5 below); this is no longer a manual follow-up
step. The standalone `rescue-stealth-funds.ts` tool itself is unchanged and
still has four documented defects (see Findings) — the drill no longer
depends on it at all.

## Deployment (this run)

| Contract | Contract ID |
|---|---|
| `stealth-announcer` | `CAU6SIHBDZR6DEUYJ5XRDIIXVL574MCR2FAN6IQP7TCNP24CBUTMB6DV` |
| `stealth-sender` | `CCKEWC2S4HKIUYKJFB45NGNT4LU5W6C7JNBDDLVBF77U6OB6MO73ZY7R` |

`stealth-sender` is built with the `drill-timelock` Cargo feature introduced in
this PR (`ROTATION_TIMELOCK_SECS = 60` instead of 7 days) so rotation can be
rehearsed in one sitting. **This feature must never ship in a production build.**

Initial governance signer set is 3-of-5. `drill-deployer` is also the pause-admin.

| Alias | Address | Role |
|---|---|---|
| `drill-deployer` | `GBPV7NHTH2DJHQAEAXKSUJS3YK5V4OJRFWDQU5NSHVIWUWMXW2RJMTVA` | Pause-admin and signer |
| `drill-signer-1` | `GAGEHMDYONXQBDRN2HSAVM76277H3CQRGEP2LMAZ6WDD3D37Y44FQJGX` | Signer |
| `drill-signer-2` | `GD44S76CCB776TAPJZIRNXENR3NOTCXO42V6T47NHFHNY3Y7H25X7GVP` | Signer |
| `drill-signer-3` | `GAYDRMOO6ADFKHVMTYGFE36QY36JXOQGJM7ADV32LFVKJ2JMZ6CHSRMM` | Signer (not needed for quorum) |
| `drill-signer-4` | `GCEOH5QQI3GN7SCZM52NJJYDLWQIELWCRFDFAQHBXREIKRPJDXPDSGCQ` | Treated as lost or compromised; rotated out |
| `drill-signer-5-new` | `GDC4C5OP74AV4KZCPJJ4UT5OVWG6JYPPFAZD3EBJYVGBPW57L6RX4DYJ` | Rotated in |

## Timeline and evidence (all times UTC, 2026-09-28)

| # | Phase | Start | End | Duration | Evidence |
|---|---|---|---|---|---|
| 1 | Simulate operator key loss | 21:41:42 | 21:41:42 | n/a | Declared in the script; no on-chain action. Marks incident start. |
| 2 | **Pause** | 21:41:43 | 21:41:53 | 10s | Tx `2a579deae655716164bda6a1741291134c2da90349b714f15d8f2a293ec3e159`; event `paused`; `is_paused` = `true` |
| 3 | **Propose** rotation | 21:41:53 | 21:42:00 | 7s | Tx `a7536b8f97e1db9479f4799343ef0d7bc368cec75f15e96efbb819f63a7f8e85` |
| 4 | **Approve** x2 (quorum) | 21:42:00 | 21:42:23 | 23s | Txs `69e4c81e32018ecac7a025fc1635f827cc5022425a918bf1bec10e0e09a25bd0`, `4dfa7fca6673ed9e514a4cf705457db89d46e2cc8a583cc9b45621c1dea08135`; `pending_rotation` shows 3 approvals, threshold 3 |
| 5 | **Execute** rotation | 21:43:07 | 21:43:17 | 10s | Tx `bdad2967358a65e86827d6e4e11bac5ef4eaf1110723ecae714a883530d0608d`; event `SignersRotated`; `signers` no longer contains `drill-signer-4` |
| 6 | **Rescue** (real on-chain) | 21:43:25 | 21:43:41 | 16s | Tx `522f2e5aa693c2f23195bdc0637db1e5f11a3fe907a66b3f69df2b80218028b5`; independently verified via RPC `getEvents`. Full detail below. |
| 7 | **Unpause** / recovery | 21:43:42 | 21:43:53 | 11s | Tx `9b15fa2ea96d83d8164fb71e96547454536f48a8cfba5ed0fc3474b2539dfc61`; event `unpaused`; `is_paused` = `false` |

Setup transactions (not part of recovery time): `init`
`e2f02cb0124316946020e945c0a93c2c31de27d39abe8fd7e194259457527ee3`, `init_multisig`
`785c1d38aba83bbfe5eb0a199cec850d3ab3aa7c37ef00024a2508eedfebd1d9`.

**Recovery time**

- Pause confirmed **11 seconds** after incident start.
- Compromised signer removed **1m35s** after incident start (21:41:42 to 21:43:17).
- Fully recovered and unpaused **2m11s** after incident start (21:41:42 to 21:43:53), including a real, independently-verified rescue transaction along the way.

These times are unrealistically short on one point: the rotation timelock was 60
seconds. In production it is 7 days, so a real signer rotation takes at least a
week, during which the contract stays paused or exposed. Recovery time for a real
incident is dominated by that timelock, not by the mechanics measured here.

## Rescue phase — real on-chain evidence

This addresses the maintainer's request directly: a real Futurenet rescue
transaction, submitted and independently verified, plus a demonstration that
the balance guard works once pointed at a real address on the right network.

**1. A real, funded, unannounced account** stands in for a stuck payment:

- Address: `GD5FDWI64ZFQZU5SSGBU5O4DEGFSWIOW7NPGHCPEMYDMRAH4XDQ7Q53P`
- Funded via friendbot on Futurenet, 10,000 XLM.

**2. Balance guard, demonstrated against the correct network:**

- `GET https://horizon-testnet.stellar.org/accounts/GD5F...` → `404 not_found`.
  This is the exact class of failure Finding #1 describes: the account is real,
  but querying the wrong network's Horizon (the tool's own default) returns
  nothing.
- `GET https://horizon-futurenet.stellar.org/accounts/GD5F...` → `200 OK`,
  balance `10000.0000000` XLM, native. Confirms the guard's underlying logic is
  fine once given a real `G...` address on the network it actually lives on.

**3. A real `announce` transaction**, submitted directly to the deployed
`stealth-announcer` (`CAU6SIHBDZR6DEUYJ5XRDIIXVL574MCR2FAN6IQP7TCNP24CBUTMB6DV`)
as an inline step of `drill-operator-recovery.sh` itself:

```
stellar contract invoke --network futurenet --id CAU6SIHBDZR6DEUYJ5XRDIIXVL574MCR2FAN6IQP7TCNP24CBUTMB6DV \
  --source drill-deployer -- announce --scheme_id 2 \
  --stealth_address GD5FDWI64ZFQZU5SSGBU5O4DEGFSWIOW7NPGHCPEMYDMRAH4XDQ7Q53P \
  --ephemeral_pub_key 3d65b6ed3fa7efc11b63b8a26ae2768954008b7858d74a0f6d2c9a8d716a0d36 \
  --metadata ab00000000000000
```

- Tx hash: `522f2e5aa693c2f23195bdc0637db1e5f11a3fe907a66b3f69df2b80218028b5`
- Submitted and confirmed within the same second-resolution log window,
  21:43:25–21:43:37Z (see the raw log for the full transcript)
- `scheme_id = 2` used deliberately: this announcer is a v2 deployment, but
  `rescue-stealth-funds.ts` hardcodes `schemeId: 1` ("Default DKSAP scheme") —
  Finding #4 below.

**4. Independent verification**, via Soroban RPC directly (not the CLI's own
success message), performed automatically by the script itself:

```
POST https://rpc-futurenet.stellar.org  { "method": "getEvents", "params": {
  "startLedger": <latest ledger - 100>,
  "filters": [{ "type": "contract", "contractIds": ["CAU6SIH...UTMB6DV"] }] } }
```

The script's own log records: `VERIFIED: RPC independently confirms txHash
522f2e5aa693c2f23195bdc0637db1e5f11a3fe907a66b3f69df2b80218028b5 for contract
CAU6SIHBDZR6DEUYJ5XRDIIXVL574MCR2FAN6IQP7TCNP24CBUTMB6DV`. The script aborts
(rather than silently reporting success) if this RPC check does not return a
matching `txHash`.

**Scope note:** the funded account above is not cryptographically derived from
the ephemeral key via real stealth-address math — `deriveStealthAddress()` in
`rescue-stealth-funds.ts` is itself a placeholder (its own comments say so).
This evidence proves the `announce` call and the balance guard work correctly
end to end against a real network; it does not prove a recipient's wallet
would derive this exact address from a real payment, since that derivation
isn't implemented yet in this codebase.

`drill-operator-recovery.sh` now performs steps 1–4 above inline as its Phase
5, so this is reproducible in one run, not a one-off manual session.

## Findings

### `scripts/rescue-stealth-funds.ts` is not incident-ready

1. **Address format mismatch breaks its own safety check.** `deriveStealthAddress()`
   returns `stealth:<hex>`, but `queryBalance()` only queries addresses starting
   with `G`. So `hasFundsBeenMoved()` always gets `null` and returns `false`; the
   documented refusal to run when funds already moved can never trigger.
2. **No real on-chain broadcast.** `broadcastAnnouncement()` is a simulation stub.
   The "Tx Hash" it prints is a local SHA-256 of the payload. Nothing is
   published to `stealth-announcer`, yet the tool prints "Rescue Complete".
3. **Missing entry point.** The file defines `main()` but never calls it, so
   running it directly exits silently with code 0.
4. **Hardcoded v1 scheme against a v2 announcer.** `schemeId: 1` is described
   as the "Default DKSAP scheme", but this deployment's `announce` function is
   v2 and expects `scheme_id = 2`. Confirmed directly: submitting `scheme_id =
   2` produced the documented v2 event shape; the tool would have submitted
   the wrong scheme had its broadcast step worked at all.

Also, `commander` is imported but was not declared in `package.json`; this PR adds it.

None of these four defects are fixed in this PR. The drill no longer depends on
this tool at all: `drill-operator-recovery.sh`'s rescue phase now drives the
real `announce` call and a real balance check directly (see "Rescue phase —
real on-chain evidence" above), independent of `rescue-stealth-funds.ts`. The
earlier harness (`scripts/drill-rescue-harness.mjs`), which only exercised this
tool's exported functions locally, is no longer used by the drill script and
can be removed or kept for reference.

### Pause-admin has no rotation path

`stealth-sender` pause and unpause are gated by one `admin` address set at `init`.
Signer rotation covers the governance signer set only. If the pause-admin key is
the one lost or compromised, there is no on-chain remedy short of a contract
upgrade.

### Build requirement

`stellar contract build` refuses to build unless `overflow-checks = true` is set in
`[profile.release]`. This PR changes that value in `stellar/Cargo.toml`, which
applies to every contract in the workspace. Maintainers should review this change.

## Rollback decision points

- **Pause:** If `is_paused` is not `true` after the pause call, stop. Do not start
  a rotation on an unpaused contract. The script aborts here. If the pause-admin
  key itself is the compromised one, there is no fallback (see Findings).
- **Signer rotation, before execute:** Confirm `pending_rotation` shows quorum. If
  quorum cannot be reached because too many signers are unreachable, propose a
  rotation with a lower threshold using only reachable signers while quorum is
  still possible. Do not `cancel_rotate_signers` to "start clean": cancelling
  discards approvals and restarts the full timelock. If the wrong signer set was
  proposed, cancelling is correct, and it costs the timelock.
- **Signer rotation, after execute:** Read `signers`. If the compromised signer is
  still present, the rotation did not do its job; the script aborts. Keep the
  contract paused.
- **Rescue:** The real `announce` call and balance check are now proven to work
  on-chain (see above). Do not use `rescue-stealth-funds.ts` itself in a real
  incident until its four documented defects are fixed and it is re-rehearsed;
  a real incident should drive `announce` directly, the way this drill now does.
- **Unpause:** If `is_paused` is still `true`, re-run `unpause` (idempotent).

## Limitations of this drill

- "Operator key loss" is declared by the script, not enacted. No key is destroyed
  and no failed-auth attempt is made.
- Recovery is confirmed by `is_paused` returning `false`. The drill does not
  execute a `send` afterward to prove sends work again.
- The rescue phase proves the `announce` call and balance guard work against a
  real network, but the funded account is not cryptographically derived from
  the ephemeral key — real stealth-address derivation isn't implemented in
  `rescue-stealth-funds.ts` yet (see the scope note above).

## Recommended follow-ups

1. Add a rotation path for the pause-admin.
2. Fix the four defects in `rescue-stealth-funds.ts` (address format, no real
   broadcast, missing entry point, hardcoded v1 scheme_id) and re-rehearse the
   tool itself, now that the drill has shown what a working version needs to do.
3. Update the "not yet rehearsed" notice in `stellar/MULTISIG.md` to link this report.
4. Extend the drill to send a token after unpause.
5. Implement real stealth-address derivation (replacing the placeholder in
   `deriveStealthAddress()`) so a future rescue rehearsal can prove address
   correctness, not just that `announce` and the balance guard work.
