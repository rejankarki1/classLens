const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../..');
const options = {
  strict: true, noEmit: true, skipLibCheck: true, types: [],
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
};
const program = ts.createProgram([path.join(__dirname, 'handler.ts')], options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (value) => value,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }));
  process.exit(1);
}

require.extensions['.ts'] = (module, filename) => {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(code, filename);
};

const { createHandler } = require('./handler.ts');
const ownerId = '11111111-1111-4111-8111-111111111111';
const config = { supabaseUrl: 'https://example.invalid', publishableKey: 'public', serviceRoleKey: 'service' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function setup({ invalidJwt = false, storageFails = false, databaseFails = false, authFails = false } = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return invalidJwt ? json({}, 401) : json({ id: ownerId });
    if (url.includes('/rest/v1/captures?')) return json([{ storage_path: `captures/${ownerId}/capture/photo.jpg` }]);
    if (url.includes('/rest/v1/materials?')) return json([{ storage_path: 'materials/material/photo.jpg', lectures: { owner_id: ownerId } }]);
    if (url.endsWith('/storage/v1/object/list/lecture-materials')) {
      const prefix = JSON.parse(init.body).prefix;
      if (prefix === `captures/${ownerId}`) return json([{ name: 'orphan-capture', id: null, metadata: null }]);
      if (prefix === `captures/${ownerId}/orphan-capture`) return json([{ name: 'photo.jpg', id: 'object-id', metadata: { size: 10 } }]);
      throw new Error(`Unexpected Storage prefix: ${prefix}`);
    }
    if (url.endsWith('/storage/v1/object/lecture-materials')) return storageFails ? json({}, 500) : json([]);
    if (url.endsWith('/rest/v1/rpc/delete_user_owned_data')) return databaseFails ? json({}, 500) : json(null);
    if (url.endsWith(`/auth/v1/admin/users/${ownerId}`)) return authFails ? json({}, 500) : json({});
    throw new Error(`Unexpected request: ${url}`);
  };
  return { handler: createHandler(config, fetcher, { error: () => {} }), calls };
}

(async () => {
  const missing = setup();
  assert.equal((await missing.handler(new Request('https://app/delete', { method: 'POST' }))).status, 401);
  assert.equal(missing.calls.length, 0);

  const invalid = setup({ invalidJwt: true });
  assert.equal((await invalid.handler(new Request('https://app/delete', { method: 'POST', headers: { authorization: 'Bearer bad' } }))).status, 401);
  assert.equal(invalid.calls.length, 1);

  const success = setup();
  const response = await success.handler(new Request('https://app/delete', { method: 'POST', headers: { authorization: 'Bearer valid' } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deleted, true);
  const storage = success.calls.find((call) => call.url.endsWith('/storage/v1/object/lecture-materials') && call.init.method === 'DELETE');
  assert.deepEqual(JSON.parse(storage.init.body).prefixes, [
    `captures/${ownerId}/capture/photo.jpg`,
    `captures/${ownerId}/orphan-capture/photo.jpg`,
    'materials/material/photo.jpg',
  ]);
  assert.ok(success.calls.at(-2).url.endsWith('/rest/v1/rpc/delete_user_owned_data'));
  assert.ok(success.calls.at(-1).url.endsWith(`/auth/v1/admin/users/${ownerId}`), 'Auth user must be deleted last');

  const storageFailure = setup({ storageFails: true });
  assert.equal((await storageFailure.handler(new Request('https://app/delete', { method: 'POST', headers: { authorization: 'Bearer valid' } }))).status, 502);
  assert.ok(!storageFailure.calls.some((call) => call.url.includes('delete_user_owned_data')));

  const databaseFailure = setup({ databaseFails: true });
  assert.equal((await databaseFailure.handler(new Request('https://app/delete', { method: 'POST', headers: { authorization: 'Bearer valid' } }))).status, 502);
  assert.ok(!databaseFailure.calls.some((call) => call.url.includes('/admin/users/')));

  const authFailure = setup({ authFails: true });
  assert.equal((await authFailure.handler(new Request('https://app/delete', { method: 'POST', headers: { authorization: 'Bearer valid' } }))).status, 502);
  assert.ok(authFailure.calls.some((call) => call.url.includes('delete_user_owned_data')));

  console.log('PASS: delete-account verifies JWT ownership, deletes Storage first, commits data atomically, and deletes Auth last.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
