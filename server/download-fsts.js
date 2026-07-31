#!/usr/bin/env node
/**
 * Backward-compatible setup wrapper.
 * Verifies the checked-in, checksum-pinned tamil-morphology runtime.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const verifier = path.join(repoRoot, 'scripts', 'verify_morphology_lock.py');

const result = spawnSync('python3', [
  verifier,
  '--runtime-dir',
  path.join(repoRoot, 'server', 'fst-models'),
], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.error) {
  console.error('Failed to verify the morphology release:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
