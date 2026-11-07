import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./deploy-backend-if-needed.sh', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const deployCall = `make -C ${join(repoRoot, 'fastapi')} cloud-deploy-if-needed`;

function run(t, env, { exit = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tiernerd-deploy-check-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  const log = join(dir, 'calls');
  mkdirSync(bin);
  writeFileSync(join(bin, 'make'), `#!/bin/bash\necho "make $*" >> "$STUB_LOG"\nexit ${exit}\n`, { mode: 0o755 });
  writeFileSync(log, '');
  const result = spawnSync('/bin/bash', [script], {
    encoding: 'utf8',
    env: {
      HOME: dir,
      PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
      STUB_LOG: log,
      ...env,
    },
  });
  return { result, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) };
}

test('deploys when the app targets the dev backend', (t) => {
  const { result, calls } = run(t, {});
  assert.equal(result.status, 0);
  assert.deepEqual(calls, [deployCall]);
});

test('SKIP_DEPLOY skips the deploy', (t) => {
  const { result, calls } = run(t, { SKIP_DEPLOY: '1' });
  assert.equal(result.status, 0);
  assert.deepEqual(calls, []);
  assert.match(result.stdout, /SKIP_DEPLOY/);
});

test('CI skips the deploy', (t) => {
  const { result, calls } = run(t, { CI: 'true' });
  assert.equal(result.status, 0);
  assert.deepEqual(calls, []);
  assert.match(result.stdout, /CI set/);
});

test('a non-dev API target skips the deploy', (t) => {
  const { result, calls } = run(t, { EXPO_PUBLIC_API_URL: 'https://tiernerd-api-prod-285616249589.us-east1.run.app' });
  assert.equal(result.status, 0);
  assert.deepEqual(calls, []);
  assert.match(result.stdout, /tiernerd-api-prod-285616249589/);
});

test('an explicit dev API target still deploys', (t) => {
  const { result, calls } = run(t, { EXPO_PUBLIC_API_URL: 'https://tiernerd-api-dev-1015723670625.us-east1.run.app' });
  assert.equal(result.status, 0);
  assert.deepEqual(calls, [deployCall]);
});

test('a falsy SKIP_DEPLOY still deploys', (t) => {
  const { result, calls } = run(t, { SKIP_DEPLOY: '0' });
  assert.equal(result.status, 0);
  assert.deepEqual(calls, [deployCall]);
});

test('a failed deploy fails the caller', (t) => {
  const { result, calls } = run(t, {}, { exit: 3 });
  assert.equal(result.status, 3);
  assert.deepEqual(calls, [deployCall]);
});
