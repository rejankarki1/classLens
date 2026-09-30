/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'processingLocal.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const values = new Map([
  ['classlens.processing-session.job-a', JSON.stringify({ ownerId: 'owner-a', photos: [{}] })],
  ['classlens.processing-session.job-b', JSON.stringify({ ownerId: 'owner-b', photos: [{}] })],
  ['unrelated', 'keep'],
]);
const storage = {
  get length() { return values.size; },
  key(index) { return [...values.keys()][index] ?? null; },
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, value); },
  removeItem(key) { values.delete(key); },
};
const deleted = [];
class Directory {
  constructor(...parts) { this.uri = parts.map((part) => part.uri ?? part).join('/'); this.exists = true; }
  create() {}
  delete() { deleted.push(this.uri); this.exists = false; }
}
class File {}
const exportsObject = {};
vm.runInNewContext(code, {
  exports: exportsObject,
  globalThis: { localStorage: storage },
  JSON,
  require: (name) => {
    if (name === 'expo-sqlite/localStorage/install') return {};
    if (name === 'expo-file-system') return { Directory, File, Paths: { document: { uri: 'documents' } } };
    if (name === '@/features/capture/captureSession') return {};
    throw new Error(`Unexpected import: ${name}`);
  },
});

exportsObject.removeStagedCapturesForOwner('owner-a');
assert.equal(values.has('classlens.processing-session.job-a'), false);
assert.equal(values.has('classlens.processing-session.job-b'), true);
assert.equal(values.get('unrelated'), 'keep');
assert.ok(deleted.some((uri) => uri.endsWith('/classlens-processing/job-a')));
assert.ok(!deleted.some((uri) => uri.endsWith('/job-b')));
console.log('PASS: sign-out staging cleanup removes only the current owner’s files and metadata.');
