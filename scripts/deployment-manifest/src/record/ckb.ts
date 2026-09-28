import { ckbHashHex, fromHex } from '../hash.js';
import type { Contract } from '../manifest.js';
import { isoFromSeconds, jsonRpc } from './rpc.js';

type HashType = 'data' | 'data1' | 'data2' | 'type';

interface Script {
  code_hash: string;
  hash_type: HashType;
  args: string;
}

interface Transaction {
  transaction: { outputs: Array<{ type: Script | null }>; outputs_data: string[] };
  tx_status: { status: string; block_hash: string | null; block_number?: string | null };
}

const HASH_TYPE_BYTE: Record<HashType, number> = { data: 0, type: 1, data1: 2, data2: 4 };

const u32le = (n: number) =>
  Uint8Array.of(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);

/** Molecule serialization of a Script table, whose ckb hash is the script hash. */
export function serializeScript(script: Script): Uint8Array {
  const codeHash = fromHex(script.code_hash);
  const args = fromHex(script.args);
  const fields = [
    codeHash,
    Uint8Array.of(HASH_TYPE_BYTE[script.hash_type]),
    new Uint8Array([...u32le(args.length), ...args]),
  ];
  const headerSize = 4 * (fields.length + 1);
  const total = headerSize + fields.reduce((n, f) => n + f.length, 0);
  const out = [...u32le(total)];
  let offset = headerSize;
  for (const f of fields) {
    out.push(...u32le(offset));
    offset += f.length;
  }
  for (const f of fields) out.push(...f);
  return Uint8Array.from(out);
}

export const ckbNetworkId = (rpc: string) => jsonRpc<string>(rpc, 'get_block_hash', ['0x0']);

export interface CkbTarget {
  name: string;
  txHash: string;
  index: number;
  hashType: HashType;
  external?: boolean;
}

export async function recordCkbScript(
  rpc: string,
  target: CkbTarget,
): Promise<Omit<Contract, 'version' | 'sourceCommit'>> {
  const tx = await jsonRpc<Transaction | null>(rpc, 'get_transaction', [target.txHash]);
  if (!tx || tx.tx_status.status !== 'committed' || !tx.tx_status.block_hash) {
    throw new Error(`${target.name}: ${target.txHash} is not committed`);
  }
  const header = await jsonRpc<{ number: string; timestamp: string }>(rpc, 'get_header', [
    tx.tx_status.block_hash,
  ]);
  const data = fromHex(tx.transaction.outputs_data[target.index]);
  const output = tx.transaction.outputs[target.index];

  let id: string;
  if (target.hashType === 'type') {
    if (!output.type) throw new Error(`${target.name}: output ${target.index} has no type script`);
    id = ckbHashHex(serializeScript(output.type));
  } else {
    id = ckbHashHex(data);
  }

  return {
    name: target.name,
    id,
    ...(target.external ? { external: true } : {}),
    artifactHash: { algorithm: 'blake2b-256', value: ckbHashHex(data) },
    deployment: {
      height: parseInt(header.number, 16),
      txHash: target.txHash,
      deployer: null,
      timestamp: isoFromSeconds(Math.floor(parseInt(header.timestamp, 16) / 1000)),
    },
    ckb: {
      hashType: target.hashType,
      cellDep: { txHash: target.txHash, index: target.index, depType: 'code' },
    },
  };
}
