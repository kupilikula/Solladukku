#!/usr/bin/env node
/**
 * Backward-compatible setup wrapper.
 * Builds FST binaries from vendored ThamizhiMorph + local patches.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const builder = path.join(repoRoot, 'fst', 'build', 'build_fsts.py');

const result = spawnSync('python3', [builder], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.error) {
  console.error('Failed to run FST builder:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
