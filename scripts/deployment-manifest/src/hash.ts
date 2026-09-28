import { blake2b } from '@noble/hashes/blake2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

const CKB_PERSONALIZATION = utf8ToBytes('ckb-default-hash');

const hex = (bytes: Uint8Array) => `0x${bytesToHex(bytes)}`;

export const keccak256Hex = (data: Uint8Array) => hex(keccak_256(data));
export const sha256Hex = (data: Uint8Array) => hex(sha256(data));
export const ckbHashHex = (data: Uint8Array) =>
  hex(blake2b(data, { dkLen: 32, personalization: CKB_PERSONALIZATION }));

export function fromHex(value: string): Uint8Array {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) {
    throw new Error(`not a hex string: ${value}`);
  }
  return Uint8Array.from(clean.match(/../g) ?? [], (byte) => parseInt(byte, 16));
}

/** JSON with object keys sorted at every level, so equal values serialize identically. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * sha256 of an ABI in canonical form: entries sorted, keys sorted. Accepts a
 * bare ABI array or a Hardhat/Goldsky `{ "abi": [...] }` wrapper, so copies
 * that differ only in formatting or wrapping hash the same.
 */
export function canonicalAbiSha256(json: unknown): string {
  const abi = Array.isArray(json) ? json : (json as { abi?: unknown })?.abi;
  if (!Array.isArray(abi)) throw new Error('ABI must be an array or an object with an "abi" array');
  const entries = abi.map(stableStringify).sort();
  return sha256Hex(utf8ToBytes(`[${entries.join(',')}]`));
}
