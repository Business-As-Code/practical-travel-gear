import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Exercise the real npm build command in a disposable fixture. Only expensive
// phase executables are substituted; no build/deploy command can contact CF.
function runBuild(fail = '') {
  const root = mkdtempSync(join(tmpdir(), 'ptg-build-gate-'));
  try {
    mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
    writeFileSync(join(root, 'phase.cjs'), `
      const fs = require('node:fs');
      const phase = process.argv[2];
      fs.appendFileSync('phases.txt', phase + '\\n');
      process.exit(phase === process.env.FAIL_PHASE ? 17 : 0);
    `);
    writeFileSync(join(root, 'node_modules/.bin/astro'), '#!/bin/sh\nexec node phase.cjs build\n', { mode: 0o755 });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: {
      ...scripts, test: 'node phase.cjs test', typecheck: 'node phase.cjs typecheck',
    } }));
    const result = spawnSync('npm', ['run', 'build'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, FAIL_PHASE: fail },
    });
    assert.ifError(result.error);
    return { status: result.status, phases: readFileSync(join(root, 'phases.txt'), 'utf8').trim().split('\n') };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('production build runs tests and typecheck before Astro; deployment reuses the gate', () => {
  assert.deepEqual(runBuild(), { status: 0, phases: ['test', 'typecheck', 'build'] });
  assert.equal(scripts.test, 'node --test scripts/*.test.mjs');
  assert.equal(scripts.typecheck, 'astro check');
  assert.equal(scripts.build, 'npm test && npm run typecheck && astro build');
  assert.equal(scripts.deploy, 'npm run build && wrangler deploy');
});

test('failed tests block typecheck and production build', () => {
  const result = runBuild('test');
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.phases, ['test']);
});

test('failed typecheck blocks production build', () => {
  const result = runBuild('typecheck');
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.phases, ['test', 'typecheck']);
});
