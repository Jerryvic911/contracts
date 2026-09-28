import { base32, base58 } from '@scure/base';

// Stellar strkey version bytes (SEP-23).
const STRKEY_CONTRACT = 2 << 3;
const STRKEY_ACCOUNT = 6 << 3;

function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/** Decode a Stellar strkey and return its 32-byte payload, checking version byte and checksum. */
export function decodeStrkey(value: string, versionByte: number): Uint8Array {
  let raw: Uint8Array;
  try {
    raw = base32.decode(value);
  } catch {
    throw new Error(`${value} is not valid base32`);
  }
  if (raw.length !== 35) throw new Error(`${value} has the wrong length for a strkey`);
  if (raw[0] !== versionByte) throw new Error(`${value} has the wrong strkey version byte`);
  const body = raw.subarray(0, 33);
  const checksum = raw[33] | (raw[34] << 8);
  if (crc16Xmodem(body) !== checksum) throw new Error(`${value} fails the strkey checksum`);
  return raw.subarray(1, 33);
}

export const decodeStellarContractId = (id: string) => decodeStrkey(id, STRKEY_CONTRACT);

type Check = (id: string) => string | null;

const evmAddress: Check = (id) =>
  /^0x[0-9a-fA-F]{40}$/.test(id) ? null : `${id} is not a 20-byte EVM address`;

const stellarContract: Check = (id) => {
  try {
    decodeStrkey(id, STRKEY_CONTRACT);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
};

const stellarAccount: Check = (id) => {
  try {
    decodeStrkey(id, STRKEY_ACCOUNT);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
};

const solanaPubkey: Check = (id) => {
  try {
    return base58.decode(id).length === 32 ? null : `${id} does not decode to 32 bytes`;
  } catch {
    return `${id} is not valid base58`;
  }
};

const hash32: Check = (id) => (/^0x[0-9a-f]{64}$/.test(id) ? null : `${id} is not a 32-byte hash`);

/** Checks the schema's regexes cannot express: checksums and decoded lengths. */
export const ID_CHECKS = {
  evm: { contract: evmAddress, deployer: evmAddress },
  stellar: { contract: stellarContract, deployer: stellarAccount },
  solana: { contract: solanaPubkey, deployer: solanaPubkey },
  ckb: { contract: hash32, deployer: null },
} as const;
