import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./build-ios-testflight.sh', import.meta.url));
const credentials = {
  ASC_KEY_ID: 'fixture-key',
  ASC_ISSUER_ID: 'fixture-issuer',
  ASC_PRIVATE_KEY: 'fixture-private-key',
  APPLE_CERTIFICATE_P12_BASE64: Buffer.from('distribution fixture').toString('base64'),
  APPLE_CERTIFICATE_PASSWORD: 'fixture-distribution-password',
};
const development = {
  APPLE_DEVELOPMENT_CERTIFICATE_P12_BASE64: Buffer.from('development fixture').toString('base64'),
  APPLE_DEVELOPMENT_CERTIFICATE_PASSWORD: 'fixture-development-password',
};

function run(t, extraEnv) {
  const dir = mkdtempSync(join(tmpdir(), 'tiernerd-signing-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  const runnerTemp = join(dir, 'runner');
  const log = join(dir, 'calls');
  mkdirSync(bin);
  mkdirSync(runnerTemp);
  writeFileSync(log, '');
  const stub = (name, body) => writeFileSync(join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  stub('security', `
case "$1" in
  list-keychains)
    if [[ "$#" == 3 && "$2" == -d && "$3" == user ]]; then
      echo security-list >> "$STUB_LOG"
      printf '    "/fixture/login keychain"\\n    "/fixture/other.keychain"\\n'
    elif [[ "$#" == 6 && "$2" == -d && "$3" == user && "$4" == -s && "$5" == '/fixture/login keychain' && "$6" == '/fixture/other.keychain' ]]; then
      echo security-restore >> "$STUB_LOG"
    else
      echo security-set >> "$STUB_LOG"
    fi ;;
  find-identity)
    echo security-identity >> "$STUB_LOG"
    printf '%s\\n' "$STUB_IDENTITY" ;;
  create-keychain) echo security-create >> "$STUB_LOG" ;;
  delete-keychain) echo security-delete >> "$STUB_LOG" ;;
  *) echo security-other >> "$STUB_LOG" ;;
esac`);
  stub('npx', `echo expo >> "$STUB_LOG"
if [[ "\${STUB_RESOLVE_CONFIG:-}" == 1 ]]; then
  node -e 'const { getConfig } = require("./node_modules/@expo/config"); console.log(JSON.stringify(getConfig(process.cwd()).exp.ios))' > "$STUB_CONFIG_LOG" || exit $?
fi
exit 42`);
  for (const command of ['pod', 'xcodebuild', 'xcrun']) {
    stub(command, `echo ${command} >> "$STUB_LOG"; exit 42`);
  }
  stub('node', `if [[ "\${1:-}" == */testflight-build-number.mjs ]]; then echo build-number >> "$STUB_LOG"; exit 42; fi\nexec "$REAL_NODE" "$@"`);
  const result = spawnSync('/bin/bash', [script], {
    encoding: 'utf8',
    env: {
      HOME: dir,
      PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
      RUNNER_TEMP: runnerTemp,
      STUB_CONFIG_LOG: join(dir, 'config.json'),
      STUB_LOG: log,
      STUB_IDENTITY: '',
      REAL_NODE: process.execPath,
      ...extraEnv,
    },
  });
  return { result, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean), runnerTemp, configPath: join(dir, 'config.json') };
}

function assertCleaned(calls, runnerTemp) {
  assert.ok(calls.includes('security-create'));
  assert.ok(calls.includes('security-restore'));
  assert.ok(calls.includes('security-delete'));
  assert.ok(calls.indexOf('security-restore') < calls.indexOf('security-delete'));
  assert.deepEqual(readdirSync(runnerTemp), []);
  for (const command of ['pod', 'xcodebuild', 'xcrun', 'build-number']) {
    assert.ok(!calls.includes(command), `${command} must not run`);
  }
}

test('missing development credentials fail before signing or preparation', (t) => {
  const { result, calls, runnerTemp } = run(t, { ...credentials, IOS_BUILD_NUMBER: '123' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /APPLE_DEVELOPMENT_CERTIFICATE_P12_BASE64/);
  assert.match(result.stderr, /APPLE_DEVELOPMENT_CERTIFICATE_PASSWORD/);
  assert.deepEqual(calls, []);
  assert.deepEqual(readdirSync(runnerTemp), []);
});

test('missing development identity fails closed and restores the keychain', (t) => {
  const { result, calls, runnerTemp } = run(t, { ...credentials, ...development, IOS_BUILD_NUMBER: '123' });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), 'No valid Apple Development signing identity in the build keychain; supply an existing development certificate with its private key.');
  assert.ok(calls.includes('security-identity'));
  assert.ok(!calls.includes('expo'));
  assertCleaned(calls, runnerTemp);
});

test('preparation failure after a valid development identity restores the keychain', (t) => {
  for (const identity of ['Apple Development', 'iPhone Developer']) {
    const { result, calls, runnerTemp } = run(t, {
      ...credentials,
      ...development,
      IOS_BUILD_NUMBER: '123',
      STUB_IDENTITY: `  1) ABCDEF "${identity}: Fixture (48TY2FP59S)"`,
    });
    assert.notEqual(result.status, 0);
    assert.ok(calls.includes('expo'));
    assert.ok(calls.indexOf('security-identity') < calls.indexOf('expo'));
    assert.ok(calls.indexOf('expo') < calls.indexOf('security-restore'));
    assertCleaned(calls, runnerTemp);
  }
});

test('simulator preparation bypasses credentials, build lookup, and keychains', (t) => {
  const { result, calls, runnerTemp } = run(t, { SIMULATOR_SMOKE_ONLY: '1' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /Missing required environment/);
  assert.deepEqual(calls, ['expo']);
  assert.deepEqual(readdirSync(runnerTemp), []);
});

test('prebuild receives the configured app bundle ID', (t) => {
  for (const bundleId of [undefined, 'com.example.tiernerd']) {
    const { result, configPath } = run(t, {
      SIMULATOR_SMOKE_ONLY: '1',
      STUB_RESOLVE_CONFIG: '1',
      ...(bundleId ? { IOS_BUNDLE_ID: bundleId } : {}),
    });
    assert.equal(result.status, 42, result.stderr);
    const ios = JSON.parse(readFileSync(configPath, 'utf8'));
    assert.equal(ios.bundleIdentifier, bundleId ?? 'com.maxwellward.tiernerd');
    assert.equal(ios.appleTeamId, '48TY2FP59S');
    assert.equal(ios.supportsTablet, true);
  }
});
