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
  // Simulates an existing row this select would find (RLS-scoped to the
  // caller's own rows). Set insertError to simulate a unique-constraint hit
  // when no row is visible but the token value is already taken by someone else.
  existingRowId = null,
  insertError = null,
} = {}) {
  const calls = { selects: [], inserts: [], updates: [], deletes: [], tokenRequests: 0 };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: sessionUserId ? { user: { id: sessionUserId } } : null } }) },
    from: (table) => {
      assert.equal(table, 'device_push_tokens');
      return {
        select: (columns) => {
          assert.equal(columns, 'id');
          return {
            eq: (column, value) => {
              calls.selects.push({ column, value });
              return {
                returns: () => ({
                  maybeSingle: async () => ({ data: existingRowId ? { id: existingRowId } : null, error: null }),
                }),
              };
            },
          };
        },
        insert: (values) => {
          calls.inserts.push(values);
          return Promise.resolve({ error: insertError });
        },
        update: (values) => {
          return {
            eq: (column, value) => {
              calls.updates.push({ values, column, value });
              return Promise.resolve({ error: null });
            },
          };
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
  assert.equal(mock.calls.inserts.length, 0);
  console.log('PASS: mock mode makes no notification or Supabase calls.');

  // Permission denied: never attempts to obtain a token.
  const denied = load({ permissionGranted: false });
  await denied.exports.registerDeviceToken();
  assert.equal(denied.calls.tokenRequests, 0);
  assert.equal(denied.calls.inserts.length, 0);
  console.log('PASS: denied permission skips token registration without throwing.');

  // Missing EAS project / provider failure: resolves silently, no writes.
  const failing = load({ tokenError: new Error('No EAS project ID found for this app') });
  await failing.exports.registerDeviceToken();
  assert.equal(failing.calls.tokenRequests, 1);
  assert.equal(failing.calls.inserts.length, 0);
  console.log('PASS: a token-provider failure (e.g. missing EAS project) resolves without throwing.');

  // First-ever registration: no existing row visible -> insert, never update.
  // (This is the case a naive upsert-with-owner_id-in-payload would also get
  // right; the bug this replaced only showed up on re-registration below.)
  const first = load({ tokenResult: 'ExponentPushToken[abc123]', sessionUserId: 'owner-9' });
  await first.exports.registerDeviceToken();
  assert.equal(first.calls.inserts.length, 1);
  assert.equal(first.calls.updates.length, 0);
  // Field-by-field, not a whole-object deepEqual: this object is a literal
  // constructed inside the vm-executed code, so it carries that context's
  // own Object.prototype identity -- strict deepEqual would fail on
  // prototype mismatch even with identical own properties.
  assert.equal(first.calls.inserts[0].owner_id, 'owner-9');
  assert.equal(first.calls.inserts[0].expo_push_token, 'ExponentPushToken[abc123]');
  assert.equal(first.calls.inserts[0].platform, 'ios');
  assert.deepEqual(Object.keys(first.calls.inserts[0]).sort(), ['expo_push_token', 'owner_id', 'platform']);
  console.log('PASS: first-ever registration inserts once with the correct row shape.');

  // Re-registration of the SAME token by its OWN owner (the common case --
  // happens on essentially every relaunch): must UPDATE, never attempt an
  // insert that would violate the unique constraint, and must never touch
  // owner_id (not update-grantable by design, so it can't be silently
  // reassigned between accounts).
  const reregister = load({ tokenResult: 'ExponentPushToken[abc123]', sessionUserId: 'owner-9', existingRowId: 'row-1' });
  await reregister.exports.registerDeviceToken();
  assert.equal(reregister.calls.inserts.length, 0);
  assert.equal(reregister.calls.updates.length, 1);
  assert.deepEqual(Object.keys(reregister.calls.updates[0].values).sort(), ['platform', 'updated_at']);
  assert.equal(reregister.calls.updates[0].column, 'id');
  assert.equal(reregister.calls.updates[0].value, 'row-1');
  console.log('PASS: re-registering an already-owned token updates in place and never touches owner_id.');

  // A token already owned by a DIFFERENT account: RLS makes the select see
  // nothing, so this falls through to insert, which then hits the unique
  // constraint. Must resolve silently, never reassign ownership.
  const crossAccount = load({ tokenResult: 'ExponentPushToken[shared]', sessionUserId: 'owner-2', insertError: { code: '23505', message: 'duplicate key value violates unique constraint' } });
  await crossAccount.exports.registerDeviceToken();
  assert.equal(crossAccount.calls.inserts.length, 1);
  assert.equal(crossAccount.calls.updates.length, 0);
  console.log('PASS: a token already owned by a different account fails the insert silently instead of reassigning ownership.');

  await first.exports.removeMyDeviceTokens();
  assert.equal(first.calls.deletes.length, 1);
  assert.deepEqual(first.calls.deletes[0], { column: 'expo_push_token', value: 'ExponentPushToken[abc123]' });
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
