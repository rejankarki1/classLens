const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const file = path.join(__dirname, 'pushTokens.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load({
  dataMode = 'supabase',
  platform = 'ios',
  permissionGranted = true,
  tokenResult = null,
  tokenError = null,
  sessionUserId = 'user-1',
} = {}) {
  const calls = { upserts: [], deletes: [], tokenRequests: 0 };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: sessionUserId ? { user: { id: sessionUserId } } : null } }) },
    from: (table) => {
      assert.equal(table, 'device_push_tokens');
      return {
        upsert: (values, options) => {
          calls.upserts.push({ values, options });
          return Promise.resolve({ error: null });
        },
        delete: () => ({
          eq: (column, value) => {
            calls.deletes.push({ column, value });
            return { returns: () => Promise.resolve({ data: [], error: null }) };
          },
        }),
      };
    },
  };
  const untouchableSupabase = {
    from: () => { throw new Error('mock mode must never query Supabase'); },
    auth: { getSession: async () => { throw new Error('mock mode must never read a session'); } },
  };
  const exportsObject = {};
  vm.runInNewContext(code, {
    exports: exportsObject,
    Error, Date, Promise,
    require: (name) => {
      if (name === '@/lib/dataMode') return { getDataMode: () => dataMode };
      if (name === '@/lib/supabase') return { supabase: dataMode === 'supabase' ? supabase : untouchableSupabase };
      if (name === 'expo-constants') return { expoConfig: {} };
      if (name === 'expo-notifications') {
        return {
          IosAuthorizationStatus: { PROVISIONAL: 3 },
          getPermissionsAsync: async () => ({ granted: permissionGranted, ios: undefined }),
          getExpoPushTokenAsync: async () => {
            calls.tokenRequests += 1;
            if (tokenError) throw tokenError;
            return { data: tokenResult };
          },
        };
      }
      if (name === 'react-native') return { Platform: { OS: platform } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { exports: exportsObject, calls };
}

(async () => {
  // Mock mode: both functions are complete no-ops, touching neither
  // Notifications nor Supabase.
  const mock = load({ dataMode: 'mock' });
  await mock.exports.registerDeviceToken();
  await mock.exports.removeMyDeviceTokens();
  assert.equal(mock.calls.tokenRequests, 0);
  assert.equal(mock.calls.upserts.length, 0);
  console.log('PASS: mock mode makes no notification or Supabase calls.');

  // Permission denied: never attempts to obtain a token.
  const denied = load({ permissionGranted: false });
  await denied.exports.registerDeviceToken();
  assert.equal(denied.calls.tokenRequests, 0);
  assert.equal(denied.calls.upserts.length, 0);
  console.log('PASS: denied permission skips token registration without throwing.');

  // Missing EAS project / provider failure: resolves silently, no upsert.
  const failing = load({ tokenError: new Error('No EAS project ID found for this app') });
  await failing.exports.registerDeviceToken();
  assert.equal(failing.calls.tokenRequests, 1);
  assert.equal(failing.calls.upserts.length, 0);
  console.log('PASS: a token-provider failure (e.g. missing EAS project) resolves without throwing.');

  // Success path: exactly one upsert, correct shape, then removal targets
  // that exact token.
  const success = load({ tokenResult: 'ExponentPushToken[abc123]', sessionUserId: 'owner-9' });
  await success.exports.registerDeviceToken();
  assert.equal(success.calls.upserts.length, 1);
  const [{ values, options }] = success.calls.upserts;
  assert.equal(values.owner_id, 'owner-9');
  assert.equal(values.expo_push_token, 'ExponentPushToken[abc123]');
  assert.equal(values.platform, 'ios');
  assert.equal(options.onConflict, 'expo_push_token');
  console.log('PASS: a granted permission with a real token issues exactly one upsert with the correct row shape.');

  await success.exports.removeMyDeviceTokens();
  assert.equal(success.calls.deletes.length, 1);
  assert.deepEqual(success.calls.deletes[0], { column: 'expo_push_token', value: 'ExponentPushToken[abc123]' });
  console.log('PASS: removal with a known token deletes only that token\'s row.');

  // No token known in this process (e.g. relaunch after logout elsewhere):
  // falls back to removing every token owned by the signed-in user.
  const fallback = load({ sessionUserId: 'owner-2' });
  await fallback.exports.removeMyDeviceTokens();
  assert.equal(fallback.calls.deletes.length, 1);
  assert.deepEqual(fallback.calls.deletes[0], { column: 'owner_id', value: 'owner-2' });
  console.log('PASS: removal with no known token falls back to deleting by owner_id.');

  // Signed out: nothing to remove, no query attempted.
  const signedOut = load({ sessionUserId: null });
  await signedOut.exports.removeMyDeviceTokens();
  assert.equal(signedOut.calls.deletes.length, 0);
  console.log('PASS: removal while signed out makes no delete call.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
