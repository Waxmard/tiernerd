import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./ios.sh', import.meta.url));

function run(t, deployExit) {
  const dir = mkdtempSync(join(tmpdir(), 'tiernerd-ios-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  const scripts = join(dir, 'scripts');
  const app = join(dir, 'frontend/ios/DerivedData/Build/Products/Release-iphoneos/TierNerd.app');
  const log = join(dir, 'calls');
  for (const path of [bin, scripts, app]) mkdirSync(path, { recursive: true });
  copyFileSync(script, join(scripts, 'ios.sh'));
  writeFileSync(join(scripts, 'deploy-backend-if-needed.sh'), `echo deploy-output\nexit ${deployExit}\n`);
  writeFileSync(join(app, 'TierNerd'), '', { mode: 0o755 });
  writeFileSync(join(bin, 'xcrun'), '#!/bin/bash\necho "xcrun $*" >> "$STUB_LOG"\n', { mode: 0o755 });
  writeFileSync(log, '');
  const result = spawnSync('/bin/bash', [join(scripts, 'ios.sh')], {
    encoding: 'utf8',
    env: { HOME: dir, PATH: `${bin}:/usr/bin:/bin`, STUB_LOG: log, IOS_REUSE: '1' },
  });
  return { result, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) };
}

test('a failed backend deploy stops before the app is installed', (t) => {
  const { result, calls } = run(t, 3);
  assert.equal(result.status, 3);
  assert.deepEqual(calls, []);
  assert.match(result.stderr, /deploy-output/);
});

test('a successful backend deploy lets the install proceed', (t) => {
  const { result, calls } = run(t, 0);
  assert.equal(result.status, 0);
  assert.ok(calls.some((call) => call.includes('device install app')));
});
