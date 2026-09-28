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
`stellar/scripts/drill-operator-recovery.sh`. The evidence below comes from the
**scripted run**, which anyone can repeat. Full raw output is in
`drills/2026-09-28T11-17-22Z-operator-recovery.log`.

All required elements ran: **operator key loss (simulated), pause, signer
rotation, rescue, recovery.** The rescue phase ran, but it rehearses a tool that
does not yet work (see Findings).

## Deployment (scripted run)

| Contract | Contract ID |
|---|---|
| `stealth-announcer` | `CAI2ZVGW5BJQBFTLZ5KW6G5XGPC6L2FMVFQEJTH4DDGLIOABQRMSUB3K` |
| `stealth-sender` | `CAYZWUCQDXRP6UKG6NBXJ3CSDGS6APBLPDRBWGWSYTJ5XHERILBPQFHW` |

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

## Timeline and evidence (all times UTC)

| # | Phase | Start | End | Duration | Evidence |
|---|---|---|---|---|---|
| 1 | Simulate operator key loss | 11:18:16 | 11:18:16 | n/a | Declared in the script; no on-chain action. Marks incident start. |
| 2 | **Pause** | 11:18:16 | 11:18:29 | 13s | Tx `c3241ec394ea0566fd8950c95ad45f1d9f556375b8987b545674b838d17b814a`; event `paused`; `is_paused` = `true` |
| 3 | **Propose** rotation | 11:18:29 | 11:18:37 | 8s | Tx `b7293ffab2f681a9e789d1aa1954125460d88a9b12a640b41eb051f81062b717` |
| 4 | **Approve** x2 (quorum) | 11:18:37 | 11:19:01 | 24s | Txs `8ac82468fe6aeff46444e5cf79d561442b253eabfb533fa66f0431f4099ba458`, `97fd2fb70642e057bbc7072cbc0faccdd3095145202b6abf411e1474fbb30535`; `pending_rotation` shows 3 approvals, threshold 3 |
| 5 | **Execute** rotation | 11:19:43 | 11:19:53 | 10s | Tx `4c85c1c10053fb4cb9616d4ceeab8c990122cce92a63e6731a32d8f17ad045e9`; event `SignersRotated`; `signers` no longer contains `drill-signer-4` |
| 6 | **Rescue** rehearsal | 11:19:54 | 11:20:02 | 8s | Local simulation only; no on-chain transaction (see Findings) |
| 7 | **Unpause** / recovery | 11:20:02 | 11:20:16 | 14s | Tx `762ee45547ffcd0228cd89fe972e0b66e77abe55eb65655a7d603ed12b6d5f88`; event `unpaused`; `is_paused` = `false` |

Setup transactions (not part of recovery time): `init`
`7a246dce94a528dfb5ccfa05553460594afeac7844d1cb893e46fd043db81912`, `init_multisig`
`27e397922a4a2a56b518e434638f8c8791fcb460ead6bb04aa5f56b1f5a14ad9`.

**Recovery time**

- Pause confirmed **13 seconds** after incident start.
- Compromised signer removed **1m37s** after incident start (11:18:16 to 11:19:53).
- Fully recovered and unpaused **2m00s** after incident start (11:18:16 to 11:20:16).

These times are unrealistically short on one point: the rotation timelock was 60
seconds. In production it is 7 days, so a real signer rotation takes at least a
week, during which the contract stays paused or exposed. Recovery time for a real
incident is dominated by that timelock, not by the mechanics measured here.

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

Also, `commander` is imported but was not declared in `package.json`; this PR adds it.

The drill harness (`scripts/drill-rescue-harness.mjs`) imports the exported
functions directly, so it does not depend on the missing entry point. It does not
fix any of the three defects.

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
- **Rescue:** Do not use this tool in a real incident until all three defects are
  fixed and the tool is re-rehearsed.
- **Unpause:** If `is_paused` is still `true`, re-run `unpause` (idempotent).

## Limitations of this drill

- "Operator key loss" is declared by the script, not enacted. No key is destroyed
  and no failed-auth attempt is made.
- Recovery is confirmed by `is_paused` returning `false`. The drill does not
  execute a `send` afterward to prove sends work again.
- The rescue phase is a local simulation of a tool that does not broadcast.

## Recommended follow-ups

1. Add a rotation path for the pause-admin.
2. Fix the three defects in `rescue-stealth-funds.ts` and re-rehearse with a real broadcast.
3. Update the "not yet rehearsed" notice in `stellar/MULTISIG.md` to link this report.
4. Extend the drill to send a token after unpause.
