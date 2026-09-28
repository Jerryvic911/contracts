import fs from 'node:fs';
import { canonicalAbiSha256, fromHex, keccak256Hex } from '../hash.js';
import type { Contract } from '../manifest.js';
import { repoPath } from '../paths.js';
import { isoFromSeconds, jsonRpc } from './rpc.js';

interface Receipt {
  blockNumber: string;
  contractAddress: string | null;
  from: string;
  transactionHash: string;
}

interface Block {
  timestamp: string;
  transactions: Array<{ hash: string; to: string | null }>;
}

const toHex = (n: number) => `0x${n.toString(16)}`;

async function codeAt(rpc: string, address: string, block: number | 'latest'): Promise<string> {
  return jsonRpc<string>(rpc, 'eth_getCode', [
    address,
    typeof block === 'number' ? toHex(block) : block,
  ]);
}

/** First block with code at `address`. Needs an archive node. */
async function findCreationBlock(rpc: string, address: string): Promise<number> {
  let lo = 0;
  let hi = parseInt(await jsonRpc<string>(rpc, 'eth_blockNumber', []), 16);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await codeAt(rpc, address, mid)) !== '0x') hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export async function evmNetworkId(rpc: string): Promise<string> {
  return String(parseInt(await jsonRpc<string>(rpc, 'eth_chainId', []), 16));
}

export interface EvmTarget {
  name: string;
  address: string;
  txHash?: string;
  abiPath?: string;
}

export async function recordEvmContract(
  rpc: string,
  target: EvmTarget,
): Promise<Omit<Contract, 'version' | 'sourceCommit'>> {
  const code = await codeAt(rpc, target.address, 'latest');
  if (code === '0x') throw new Error(`${target.name}: no code at ${target.address}`);

  let receipt: Receipt | null = null;
  if (target.txHash) {
    receipt = await jsonRpc<Receipt>(rpc, 'eth_getTransactionReceipt', [target.txHash]);
    if (receipt.contractAddress?.toLowerCase() !== target.address.toLowerCase()) {
      throw new Error(`${target.name}: ${target.txHash} did not create ${target.address}`);
    }
  }
  const height = receipt
    ? parseInt(receipt.blockNumber, 16)
    : await findCreationBlock(rpc, target.address);
  const block = await jsonRpc<Block>(rpc, 'eth_getBlockByNumber', [toHex(height), true]);

  if (!receipt) {
    // Direct deployments show up as a contract-creation transaction in that block.
    for (const tx of block.transactions.filter((t) => t.to === null)) {
      const r = await jsonRpc<Receipt>(rpc, 'eth_getTransactionReceipt', [tx.hash]);
      if (r.contractAddress?.toLowerCase() === target.address.toLowerCase()) receipt = r;
    }
  }

  const abiPath = target.abiPath ?? `evm/subgraph/abis/${target.name}.json`;
  return {
    name: target.name,
    id: target.address,
    artifactHash: { algorithm: 'keccak256', value: keccak256Hex(fromHex(code)) },
    ...(fs.existsSync(repoPath(abiPath))
      ? {
          abi: {
            path: abiPath,
            sha256: canonicalAbiSha256(JSON.parse(fs.readFileSync(repoPath(abiPath), 'utf8'))),
          },
        }
      : {}),
    deployment: {
      height,
      txHash: receipt?.transactionHash ?? null,
      deployer: receipt?.from ?? null,
      timestamp: isoFromSeconds(parseInt(block.timestamp, 16)),
    },
  };
}
