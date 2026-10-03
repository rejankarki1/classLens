const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'purchases.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup(key) {
  let owner = 'user-1';
  let pro = false;
  const calls = { configure: [], logIn: [], logOut: 0, restore: 0, paywall: 0, warnings: [] };
  const Purchases = {
    configure: (config) => calls.configure.push(config),
    logIn: async (id) => { calls.logIn.push(id); return {}; },
    logOut: async () => { calls.logOut++; return {}; },
    getCustomerInfo: async () => ({ entitlements: { active: pro ? { pro: {} } : {} } }),
    restorePurchases: async () => { calls.restore++; pro = true; return { entitlements: { active: { pro: {} } } }; },
    getOfferings: async () => ({ current: { identifier: 'current' } }),
  };
  const exportsObject = {};
  vm.runInNewContext(code, {
    exports: exportsObject, process: { env: { EXPO_PUBLIC_REVENUECAT_IOS_KEY: key } }, __DEV__: true,
    Promise, console: { warn: (message) => calls.warnings.push(message) },
    require: (name) => {
      if (name === 'react-native') return { Platform: { OS: 'ios' } };
      if (name === '@/services/auth') return { getCurrentUserId: async () => owner };
      if (name === 'react-native-purchases') return { __esModule: true, default: Purchases };
      if (name === 'react-native-purchases-ui') return { __esModule: true, default: { presentPaywall: async () => { calls.paywall++; pro = true; } } };
      throw new Error(name);
    },
  });
  return { service: exportsObject, calls, setOwner: (id) => { owner = id; } };
}

(async () => {
  const missing = setup('');
  assert.equal(await missing.service.hasProEntitlement(), false);
  assert.equal(await missing.service.hasProEntitlement(), false);
  assert.equal(missing.calls.configure.length, 0);
  assert.equal(missing.calls.warnings.length, 1);

  const { service, calls, setOwner } = setup('test-key');
  await service.syncPurchaseIdentity('user-1');
  await service.syncPurchaseIdentity('user-1');
  assert.equal(calls.configure.length, 1);
  assert.equal(calls.configure[0].appUserID, 'user-1');
  setOwner('user-2');
  await service.syncPurchaseIdentity('user-2');
  assert.deepEqual(calls.logIn, ['user-2']);
  assert.equal(await service.hasProEntitlement(), false);
  assert.equal(await service.presentProPaywall(), true);
  assert.equal(calls.paywall, 1);
  assert.equal(await service.restoreProPurchases(), true);
  assert.equal(calls.restore, 1);
  setOwner(null);
  await service.syncPurchaseIdentity(null);
  assert.equal(calls.logOut, 1);
  assert.equal(await service.hasProEntitlement(), false);
  console.log('PASS: missing key locks Pro; login, logout, paywall purchase, and restore update identity and entitlement.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
