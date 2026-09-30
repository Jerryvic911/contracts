import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Overridable so tests can point the tool at a fixture repository.
export const REPO_ROOT = process.env.WRAITH_REPO_ROOT ?? path.resolve(here, '..', '..', '..');

export const DEPLOYMENTS_DIR = path.join(REPO_ROOT, 'deployments');
export const SCHEMA_PATH = path.join(DEPLOYMENTS_DIR, 'schema', 'v1.json');
export const MANIFEST_PATH = path.join(DEPLOYMENTS_DIR, 'manifest.json');

export function repoPath(...parts: string[]): string {
  return path.join(REPO_ROOT, ...parts);
}

export function recordPath(chain: string, network: string): string {
  return path.join(DEPLOYMENTS_DIR, chain, `${network}.json`);
}
