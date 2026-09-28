import { base64 } from '@scure/base';
import { describe, expect, it } from 'vitest';
import { canonicalAbiSha256, ckbHashHex, keccak256Hex } from '../src/hash.js';
import { ID_CHECKS, decodeStellarContractId } from '../src/ids.js';
import { buildManifest, validateDeployment, type Deployment } from '../src/manifest.js';
import { serializeScript } from '../src/record/ckb.js';
import { contractInstanceKey, wasmHashFromInstanceEntry } from '../src/record/stellar.js';

const XLM_SAC_TESTNET = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

describe('hashes', () => {
  it('match known vectors', () => {
    expect(keccak256Hex(new Uint8Array())).toBe(
      '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
    );
    // CKB's hash of empty input (blake2b-256, personalization "ckb-default-hash").
    expect(ckbHashHex(new Uint8Array())).toBe(
      '0x44f4c69744d5f8c55d642062949dcae49bc4e7ef43d388c5a12f42b5633d163e',
    );
  });

  it('canonical ABI hash ignores wrapping, entry order and key order', () => {
    const a = { type: 'event', name: 'A', inputs: [] };
    const b = { name: 'b', type: 'function', inputs: [], outputs: [], stateMutability: 'view' };
    const reordered = {
      inputs: [],
      stateMutability: 'view',
      outputs: [],
      type: 'function',
      name: 'b',
    };
    expect(canonicalAbiSha256([a, b])).toBe(canonicalAbiSha256({ abi: [reordered, a] }));
    expect(canonicalAbiSha256([a, b])).not.toBe(canonicalAbiSha256([a]));
    expect(() => canonicalAbiSha256({ notAbi: [] })).toThrow();
  });
});

describe('ids', () => {
  it('accepts real IDs', () => {
    expect(ID_CHECKS.stellar.contract(XLM_SAC_TESTNET)).toBeNull();
    expect(ID_CHECKS.solana.contract('9Ko7TuXHpLUH1ZsZWQEpeA9Tv7hX325ooWk5SD7Y9nuq')).toBeNull();
    expect(ID_CHECKS.evm.contract('0x8AE65c05E7eb48B9bA652781Bc0a3DBA09A484F3')).toBeNull();
  });

  it('rejects a Stellar ID with a bad checksum or the wrong key type', () => {
    const flipped = XLM_SAC_TESTNET.slice(0, -1) + (XLM_SAC_TESTNET.endsWith('C') ? 'D' : 'C');
    expect(ID_CHECKS.stellar.contract(flipped)).toMatch(/checksum/);
    expect(ID_CHECKS.stellar.deployer(XLM_SAC_TESTNET)).toMatch(/version byte/);
  });

  it('rejects the placeholder IDs that used to sit in stellar/deployments/futurenet.json', () => {
    expect(
      ID_CHECKS.stellar.contract('CBXYZANN0UNCERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX0001'),
    ).not.toBeNull();
  });
});

describe('encoders', () => {
  it('serializes a CKB script so its hash is the script hash (ckb-auth on testnet)', () => {
    const script = {
      code_hash: '0x00000000000000000000000000000000000000000000000000545950455f4944',
      hash_type: 'type' as const,
      args: '0x56b8e2f173d40edda94d02a64c5fb8deae3c7b313010a0f7837ab34ed225c4fc',
    };
    expect(ckbHashHex(serializeScript(script))).toBe(
      '0x0915983bb31584df4566e0946fd00ef1e9a75ad37a39ce70fec9b5cbf3b87021',
    );
  });

  it('builds the XDR ledger key for a contract instance', () => {
    const key = base64.decode(contractInstanceKey(XLM_SAC_TESTNET));
    expect(key.length).toBe(48);
    expect([...key.subarray(0, 8)]).toEqual([0, 0, 0, 6, 0, 0, 0, 1]);
    expect(key.subarray(8, 40)).toEqual(decodeStellarContractId(XLM_SAC_TESTNET));
    expect([...key.subarray(40)]).toEqual([0, 0, 0, 20, 0, 0, 0, 1]);
  });

  it('reads the wasm hash from an instance entry, and nothing from a Stellar Asset Contract', () => {
    const hash = new Uint8Array(32).fill(0xab);
    const entry = (executable: number) =>
      base64.encode(Uint8Array.from([...new Uint8Array(56), 0, 0, 0, executable, ...hash]));
    expect(wasmHashFromInstanceEntry(entry(0))).toBe(`0x${'ab'.repeat(32)}`);
    expect(wasmHashFromInstanceEntry(entry(1))).toBeNull();
  });
});

const evmDeployment = (): Deployment => ({
  chain: 'evm',
  network: 'test-net',
  networkId: '1',
  recordedBy: 'chain-query',
  contracts: [
    {
      name: 'ERC5564Announcer',
      id: '0x8AE65c05E7eb48B9bA652781Bc0a3DBA09A484F3',
      version: null,
      sourceCommit: null,
      artifactHash: { algorithm: 'keccak256', value: `0x${'00'.repeat(32)}` },
      deployment: { height: 1 },
    },
  ],
});

describe('validation', () => {
  it('accepts a minimal record', () => {
    expect(validateDeployment(evmDeployment())).toEqual([]);
  });

  it('rejects wrong algorithm, bad ID and duplicates', () => {
    const d = evmDeployment();
    d.contracts[0].artifactHash.algorithm = 'sha256';
    expect(validateDeployment(d).join()).toMatch(/const/);

    const bad = evmDeployment();
    bad.contracts[0].id = '0x1234';
    expect(validateDeployment(bad).join()).toMatch(/pattern/);

    const dup = evmDeployment();
    dup.contracts.push({ ...dup.contracts[0] });
    expect(validateDeployment(dup).join()).toMatch(/duplicate/);
  });

  it('requires a source commit on records written by a deploy script', () => {
    const d = { ...evmDeployment(), recordedBy: 'deploy-script' as const };
    expect(validateDeployment(d).join()).toMatch(/sourceCommit/);
    d.contracts[0].sourceCommit = 'a'.repeat(40);
    expect(validateDeployment(d)).toEqual([]);
  });

  it('rejects chain-specific fields on the wrong chain', () => {
    const d = evmDeployment();
    d.contracts[0].solana = {
      programData: '9Ko7TuXHpLUH1ZsZWQEpeA9Tv7hX325ooWk5SD7Y9nuq',
      upgradeAuthority: null,
    };
    expect(validateDeployment(d).length).toBeGreaterThan(0);
  });

  it('orders the manifest by chain then network', () => {
    const ckb = { ...evmDeployment(), chain: 'ckb' as const, network: 'a' };
    const evmB = { ...evmDeployment(), network: 'b' };
    const evmA = { ...evmDeployment(), network: 'a' };
    const order = buildManifest([ckb, evmB, evmA]).deployments.map(
      (d) => `${d.chain}/${d.network}`,
    );
    expect(order).toEqual(['evm/a', 'evm/b', 'ckb/a']);
  });
});
