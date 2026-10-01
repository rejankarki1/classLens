/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'auth.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const calls = { resend: [], recovery: [], verify: [], updates: [], signOut: [], functions: [], staged: [] };
let session = null;
let signUpSession = null;
const supabase = {
  auth: {
    signUp: async () => ({ data: { session: signUpSession }, error: null }),
    resend: async (input) => { calls.resend.push(input); return { error: null }; },
    signInWithPassword: async () => { session = { user: { id: 'owner-1' } }; return { error: null }; },
    resetPasswordForEmail: async (email) => { calls.recovery.push(email); return { error: null }; },
    verifyOtp: async (input) => { calls.verify.push(input); session = { user: { id: 'owner-1' } }; return { error: null }; },
    updateUser: async (input) => { calls.updates.push(input); return { error: null }; },
    signOut: async (input) => { calls.signOut.push(input); session = null; return { error: null }; },
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  functions: { invoke: async (name, input) => { calls.functions.push({ name, input }); return { error: null }; } },
};
const exportsObject = {};
vm.runInNewContext(code, {
  exports: exportsObject,
  globalThis: { localStorage: storage },
  Storage: function Storage() {},
  Error, Promise,
  require: (name) => {
    if (name === 'expo-sqlite/localStorage/install') return {};
    if (name === '@/lib/dataMode') return { getDataMode: () => 'supabase' };
    if (name === '@/lib/supabase') return { supabase };
    if (name === './pushTokens') return { removeMyDeviceTokens: async () => {} };
    if (name === './processingLocal') return { removeStagedCapturesForOwner: (owner) => calls.staged.push(owner) };
    if (name === '@/types') return {};
    throw new Error(`Unexpected import: ${name}`);
  },
});

(async () => {
  const pending = await exportsObject.signUp('student@example.com', 'secret1');
  assert.equal(pending.requiresEmailConfirmation, true);
  assert.equal(exportsObject.getPendingSignupEmail(), 'student@example.com');
  await exportsObject.resendSignupEmail('student@example.com');
  assert.equal(calls.resend[0].type, 'signup');

  await exportsObject.signIn('student@example.com', 'secret1');
  assert.equal(exportsObject.getPendingSignupEmail(), null);
  session.user.email = 'student@example.com';
  assert.equal(await exportsObject.getCurrentUserEmail(), 'student@example.com');

  await exportsObject.requestPasswordRecovery('student@example.com');
  await exportsObject.verifyPasswordRecoveryCode('student@example.com', '123456');
  assert.equal(calls.verify[0].type, 'recovery');
  await exportsObject.updateRecoveredPassword('newpass');
  assert.equal(calls.updates[0].password, 'newpass');
  assert.equal(calls.signOut.at(-1).scope, 'local');

  session = { user: { id: 'owner-1' } };
  await exportsObject.signOut();
  assert.equal(calls.staged.at(-1), 'owner-1');

  session = { user: { id: 'owner-1' } };
  await exportsObject.deleteAccount();
  assert.equal(calls.functions.at(-1).name, 'delete-account');
  assert.equal(calls.staged.at(-1), 'owner-1');
  assert.equal(calls.signOut.at(-1).scope, 'local');

  console.log('PASS: signup persistence/resend, recovery OTP, sign-out cleanup, and account deletion session cleanup.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
