# Operator Recovery Drill

A repeatable, scripted rehearsal of the incident procedure that ties together
the pause, signer-rotation, rescue, and recovery paths documented separately in
[`stellar/PAUSE.md`](../stellar/PAUSE.md) and
[`stellar/MULTISIG.md`](../stellar/MULTISIG.md).

The drill runs against a throwaway Stellar Futurenet deployment. **No real funds
are involved**: every account is generated fresh and funded by friendbot.

## What the drill covers

1. Simulated operator key loss (one governance signer is treated as compromised)
2. **Pause** `stealth-sender`
3. **Signer rotation**: propose, approve to quorum, wait out the timelock, execute
4. **Rescue**: exercises the functions in `scripts/rescue-stealth-funds.ts`
5. **Recovery**: unpause and verify

Every phase is timestamped, and the script aborts with a logged reason if a
phase does not take effect (for example, pause not confirmed, quorum not reached,
or the compromised signer still present after rotation).

## Running it

Prerequisites: `stellar` CLI, `jq`, Node with `pnpm install` already run at the
repo root. On Windows, use Git Bash or WSL.

```bash
cd stellar
./scripts/drill-operator-recovery.sh
```

Output goes to stdout and to `drills/<UTC timestamp>-operator-recovery.log` at
the repo root. That log is the evidence artifact: tx hashes, emitted events, and
timestamps for each phase.

## The `drill-timelock` feature

Production signer rotation is gated by a 7-day timelock
(`ROTATION_TIMELOCK_SECS`). That is far too long to rehearse in one sitting, so
`stealth-sender`, `stealth-batch-sender`, and `wraith-names` each expose a
`drill-timelock` Cargo feature that shortens it to **60 seconds**.

> **Never enable `drill-timelock` in a production build.** It exists only so the
> rotation flow can be rehearsed end to end on a test network. The production
> value is covered by each contract's own unit tests.

The drill script builds `stealth-sender` with this feature automatically.

## Known limitations

- The rescue phase runs through `scripts/drill-rescue-harness.mjs`, which imports
  the exported functions from `rescue-stealth-funds.ts` directly. The rescue tool
  itself has known defects (address format mismatch, no real broadcast, no CLI
  entry point) recorded in the drill report. The drill exercises and documents
  them; it does not fix them.
- Pause is controlled by a single `admin` address with no rotation path. The
  report records this as a rollback gap.

## Ownership and rollback decision points

See the latest report in [`drills/`](../drills/) for the drill owner, the
timeline with evidence, and the rollback decision points for each phase.
