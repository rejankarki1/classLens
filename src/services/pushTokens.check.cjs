const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const file = path.join(__dirname, 'pushTokens.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load({ dataMode = 'supabase', platform = 'ios', permissionGranted = true, tokenResult = null,
  tokenError = null, sessionUserId = 'user-1', rpcError = null } = {}) {
  const calls = { rpcs: [], deletes: [], tokenRequests: 0 };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: sessionUserId ? { user: { id: sessionUserId } } : null } }) },
    rpc: async (name, values) => {
      calls.rpcs.push({ name, values });
      return { error: rpcError };
    },
    from: (table) => {
      assert.equal(table, 'device_push_tokens');
      return {
        delete: () => ({
          eq: (column, value) => {
            calls.deletes.push({ column, value });
            return { returns: () => Promise.resolve({ data: [], error: null }) };
          },
        }),
      };
    },
  };
  const exportsObject = {};
  vm.runInNewContext(code, {
    exports: exportsObject, Error, Promise,
    require: (name) => {
      if (name === '@/lib/dataMode') return { getDataMode: () => dataMode };
      if (name === '@/lib/supabase') return { supabase };
      if (name === 'expo-constants') return { expoConfig: {} };
      if (name === 'expo-notifications') return {
        IosAuthorizationStatus: { PROVISIONAL: 3 },
        getPermissionsAsync: async () => ({ granted: permissionGranted, ios: undefined }),
        getExpoPushTokenAsync: async () => {
          calls.tokenRequests += 1;
          if (tokenError) throw tokenError;
          return { data: tokenResult };
        },
      };
      if (name === 'react-native') return { Platform: { OS: platform } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { exports: exportsObject, calls };
}

(async () => {
  const mock = load({ dataMode: 'mock' });
  await mock.exports.registerDeviceToken();
  assert.equal(mock.calls.tokenRequests, 0);
  assert.equal(mock.calls.rpcs.length, 0);

  const denied = load({ permissionGranted: false });
  await denied.exports.registerDeviceToken();
  assert.equal(denied.calls.tokenRequests, 0);

  const first = load({ tokenResult: 'ExponentPushToken[abc123]', sessionUserId: 'owner-9' });
  await first.exports.registerDeviceToken();
  assert.equal(first.calls.rpcs.length, 1);
  assert.equal(first.calls.rpcs[0].name, 'register_device_push_token');
  assert.equal(first.calls.rpcs[0].values.p_expo_push_token, 'ExponentPushToken[abc123]');
  assert.equal(first.calls.rpcs[0].values.p_platform, 'ios');

  const switched = load({ tokenResult: 'ExponentPushToken[abc123]', sessionUserId: 'owner-2' });
  await switched.exports.registerDeviceToken();
  assert.equal(switched.calls.rpcs.length, 1);

  const failing = load({ tokenResult: 'ExponentPushToken[abc123]', rpcError: { message: 'offline' } });
  await assert.doesNotReject(() => failing.exports.registerDeviceToken());

  await first.exports.removeMyDeviceTokens();
  assert.deepEqual(first.calls.deletes[0], { column: 'expo_push_token', value: 'ExponentPushToken[abc123]' });

  const fallback = load({ sessionUserId: 'owner-2' });
  await fallback.exports.removeMyDeviceTokens();
  assert.deepEqual(fallback.calls.deletes[0], { column: 'owner_id', value: 'owner-2' });

  console.log('PASS: push registration uses the reassigning RPC and removal remains owner-scoped.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
