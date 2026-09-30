import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pkgDir, '..', '..');
const tsx = path.join(pkgDir, 'node_modules', '.bin', 'tsx');

// Everything the check reads, copied from the real repository.
const FIXTURE_PATHS = [
  'deployments',
  'README.md',
  'evm/hardhat.config.ts',
  'evm/subgraph/subgraph.yaml',
  'evm/subgraph/abis',
  'evm/subgraph/horizen-testnet',
  'solana/Anchor.toml',
  'solana/programs/wraith-announcer/src/lib.rs',
  'solana/programs/wraith-sender/src/lib.rs',
  'solana/programs/wraith-names/src/lib.rs',
  'ckb/testnet.toml',
  'stellar/contract-ids.json',
];

let root: string;

async function cli(...args: string[]) {
  try {
    const { stdout, stderr } = await run(tsx, [path.join(pkgDir, 'src', 'cli.ts'), ...args], {
      env: { ...process.env, WRAITH_REPO_ROOT: root },
    });
    return { code: 0, output: stdout + stderr };
  } catch (err) {
    const e = err as { code: number; stdout: string; stderr: string };
    return { code: e.code, output: e.stdout + e.stderr };
  }
}

function edit(rel: string, from: string | RegExp, to: string) {
  const file = path.join(root, rel);
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(from, to);
  expect(after, `${rel} did not contain ${from}`).not.toBe(before);
  fs.writeFileSync(file, after);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wraith-manifest-'));
  for (const rel of FIXTURE_PATHS) {
    fs.cpSync(path.join(repoRoot, rel), path.join(root, rel), { recursive: true });
  }
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('check', () => {
  it('passes on the repository as committed', async () => {
    const { code, output } = await cli('check');
    expect(output).toContain('consumers agree');
    expect(code).toBe(0);
  });

  it.each([
    [
      'subgraph address',
      'evm/subgraph/subgraph.yaml',
      '0x8AE65c05E7eb48B9bA652781Bc0a3DBA09A484F3',
      '0x8AE65c05E7eb48B9bA652781Bc0a3DBA09A48400',
      /subgraph\.yaml dataSource ERC5564Announcer: address/,
    ],
    [
      'subgraph start block',
      'evm/subgraph/subgraph.yaml',
      'startBlock: 14202905',
      'startBlock: 1',
      /startBlock 1, manifest height is 14202905/,
    ],
    [
      'instant config',
      'evm/subgraph/horizen-testnet/instant-config.json',
      '"startBlock": 14202900',
      '"startBlock": 0',
      /instant-config\.json/,
    ],
    [
      'ABI copy',
      'evm/subgraph/horizen-testnet/abis/ERC5564Announcer.json',
      '"Announcement"',
      '"Announced"',
      /ABI hash/,
    ],
    [
      'hardhat chain ID',
      'evm/hardhat.config.ts',
      'chainId: 2651420',
      'chainId: 1662',
      /chainId 1662, manifest has 2651420/,
    ],
    [
      'Anchor program ID',
      'solana/Anchor.toml',
      /(\[programs\.devnet\]\nwraith_announcer = ")9Ko7/,
      '$1XXXX',
      /programs\.devnet\.wraith_announcer/,
    ],
    [
      'declare_id!',
      'solana/programs/wraith-sender/src/lib.rs',
      'E6J7GBST',
      'E6J7GBSS',
      /declare_id!/,
    ],
    [
      'CKB cell dep',
      'ckb/testnet.toml',
      /(\[cell_deps\.names_type\][^\[]*index = )0/,
      '$11',
      /cell_deps\.names_type/,
    ],
    ['README table', 'README.md', '| 456215445 |', '| 1 |', /README\.md/],
    [
      'Stellar contract IDs',
      'stellar/contract-ids.json',
      '"stealth-announcer": ""',
      '"stealth-announcer": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"',
      /contract-ids\.json/,
    ],
  ])('fails when the %s drifts', async (_label, rel, from, to, message) => {
    edit(rel, from, to);
    const { code, output } = await cli('check');
    expect(output).toMatch(message);
    expect(code).toBe(1);
  });

  it('fails when a record changes without rebuilding the manifest', async () => {
    edit('deployments/solana/solana-devnet.json', '"height": 456215445', '"height": 456215446');
    const { code, output } = await cli('check');
    expect(output).toMatch(/manifest\.json is out of date/);
    expect(code).toBe(1);
  });

  it('fails when a record is stored under the wrong name', async () => {
    fs.renameSync(
      path.join(root, 'deployments/ckb/ckb-testnet.json'),
      path.join(root, 'deployments/ckb/ckb-mainnet.json'),
    );
    const { code, output } = await cli('check');
    expect(output).toMatch(/does not match file name ckb-mainnet\.json/);
    expect(code).toBe(1);
  });
});

describe('build', () => {
  it('regenerates the manifest and derived consumers from a new record', async () => {
    const record = {
      chain: 'stellar',
      network: 'stellar-testnet',
      networkId: 'Test SDF Network ; September 2015',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      recordedBy: 'deploy-script',
      contracts: [
        {
          name: 'stealth-announcer',
          id: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
          version: '0.1.0',
          sourceCommit: 'a'.repeat(40),
          artifactHash: { algorithm: 'sha256', value: `0x${'11'.repeat(32)}` },
          deployment: { height: 123, txHash: null, deployer: null, timestamp: null },
        },
      ],
    };
    fs.mkdirSync(path.join(root, 'deployments/stellar'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'deployments/stellar/stellar-testnet.json'),
      JSON.stringify(record),
    );

    expect((await cli('check')).code).toBe(1);
    const built = await cli('build');
    expect(built.code).toBe(0);

    const ids = JSON.parse(fs.readFileSync(path.join(root, 'stellar/contract-ids.json'), 'utf8'));
    expect(ids['stealth-announcer']).toBe(record.contracts[0].id);
    expect(ids['stealth-registry']).toBe('');
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8')).toContain(
      '### Stellar: stellar-testnet',
    );

    const { code, output } = await cli('check');
    expect(output).toContain('4 deployments');
    expect(code).toBe(0);
  });

  it('refuses to build from an invalid record', async () => {
    edit(
      'deployments/evm/horizen-testnet.json',
      '"networkId": "2651420"',
      '"networkId": "horizen"',
    );
    const { code, output } = await cli('build');
    expect(output).toMatch(/networkId/);
    expect(code).toBe(1);
  });
});
