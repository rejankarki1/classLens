/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'friends.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const values = new Map();
const profileRows = [
  { id: 'real-2', name: 'Alex Rivera', year: 'Junior', major: 'Biology', is_demo: false },
  { id: 'demo-1', name: 'Prashant Demo', year: 'Junior', major: 'Computer Science', is_demo: true },
];
const friendshipRows = [
  { id: 'accepted-real', requester_id: 'user-1', addressee_id: 'real-2', status: 'accepted' },
  { id: 'accepted-demo', requester_id: 'user-1', addressee_id: 'demo-1', status: 'accepted' },
  { id: 'request-1', requester_id: 'real-2', addressee_id: 'user-1', status: 'pending' },
];
const calls = { demoFilter: [] };

function profilesQuery() {
  const query = {
    eq(column, value) { calls.demoFilter.push({ column, value }); return query; },
    ilike() { return query; },
    neq() { return query; },
    order() { return query; },
    limit() { return query; },
    in() { return query; },
    returns: async () => ({ data: profileRows, error: null }),
  };
  return query;
}

const supabase = {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
  from(table) {
    if (table === 'friendships') {
      return {
        select: () => ({
          or: () => ({ returns: async () => ({ data: friendshipRows, error: null }) }),
        }),
      };
    }
    if (table === 'profiles') return { select: profilesQuery };
    throw new Error(`Unexpected table: ${table}`);
  },
};

const exportsObject = {};
vm.runInNewContext(code, {
  exports: exportsObject,
  globalThis: {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  },
  Error,
  JSON,
  Map,
  Promise,
  Set,
  require(name) {
    if (name === 'expo-sqlite/localStorage/install') return {};
    if (name === '@/lib/dataMode') return { getDataMode: () => 'supabase' };
    if (name === '@/lib/supabase') return { supabase };
    if (name === '@/types') return {};
    throw new Error(`Unexpected import: ${name}`);
  },
});

(async () => {
  const friends = await exportsObject.getFriends();
  assert.deepEqual(Array.from(friends, (friend) => friend.name), ['Alex Rivera']);

  const before = await exportsObject.getIncomingRequests();
  assert.deepEqual(Array.from(before, (request) => request.id), ['request-1']);
  await exportsObject.declineFriendRequestLocally('request-1');
  const after = await exportsObject.getIncomingRequests();
  assert.equal(after.length, 0);

  await exportsObject.searchProfiles('Alex');
  assert.ok(calls.demoFilter.some(({ column, value }) => column === 'is_demo' && value === false));

  console.log('PASS: CatchUp filters demo profiles and keeps declined requests locally dismissed per account.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
