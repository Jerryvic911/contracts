import { base64 } from '@scure/base';
import { sha256Hex } from '../hash.js';
import type { Contract } from '../manifest.js';
import { isoFromSeconds, jsonRpc } from './rpc.js';

interface ParsedAccount<T> {
  value: { owner: string; data: { parsed: { info: T } } } | null;
}

const UPGRADEABLE_LOADER = 'BPFLoaderUpgradeab1e11111111111111111111111';

export const solanaNetworkId = (rpc: string) => jsonRpc<string>(rpc, 'getGenesisHash', []);

/** Hash as `solana-verify get-program-hash` does: sha256 of the ELF with trailing zero padding removed. */
function programHash(programDataBase64: string): string {
  const raw = base64.decode(programDataBase64);
  let end = raw.length;
  while (end > 0 && raw[end - 1] === 0) end--;
  return sha256Hex(raw.subarray(0, end));
}

export async function recordSolanaProgram(
  rpc: string,
  name: string,
  programId: string,
): Promise<Omit<Contract, 'version' | 'sourceCommit'>> {
  const program = await jsonRpc<ParsedAccount<{ programData: string }>>(rpc, 'getAccountInfo', [
    programId,
    { encoding: 'jsonParsed' },
  ]);
  if (!program.value) throw new Error(`${name}: program ${programId} not found`);
  if (program.value.owner !== UPGRADEABLE_LOADER) {
    throw new Error(`${name}: ${programId} is not owned by the upgradeable BPF loader`);
  }
  const programData = program.value.data.parsed.info.programData;
  const data = await jsonRpc<
    ParsedAccount<{ slot: number; authority: string | null; data: [string, string] }>
  >(rpc, 'getAccountInfo', [programData, { encoding: 'jsonParsed' }]);
  const info = data.value!.data.parsed.info;
  const blockTime = await jsonRpc<number | null>(rpc, 'getBlockTime', [info.slot]).catch(
    () => null,
  );

  return {
    name,
    id: programId,
    artifactHash: { algorithm: 'sha256', value: programHash(info.data[0]) },
    deployment: {
      height: info.slot,
      txHash: null,
      deployer: info.authority ?? null,
      timestamp: blockTime === null ? null : isoFromSeconds(blockTime),
    },
    solana: { programData, upgradeAuthority: info.authority ?? null },
  };
}
