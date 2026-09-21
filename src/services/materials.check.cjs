const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const file = path.join(__dirname, 'materials.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const serviceExports = {};
const ownerId = '11111111-1111-4111-8111-111111111111';
const captureId = '00000000-0000-4000-8000-000000000000';
const row = {
  id: captureId,
  capture_session_id: 'capture-test',
  client_photo_id: 'client-photo-1',
  page_number: 1,
  storage_path: `captures/${ownerId}/${captureId}/photo.jpg`,
  mime_type: 'image/jpeg',
  captured_at: '2026-09-17T12:00:00.000Z',
  status: 'uploaded',
};
let fileReads = 0;
let storageCalls = 0;
const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: ownerId } }, error: null }) },
  from: (table) => {
    assert.equal(table, 'captures');
    return {
      select: () => ({
        eq: () => ({
          returns: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
        }),
      }),
    };
  },
  storage: { from: () => { storageCalls += 1; throw new Error('Storage should be skipped.'); } },
};

vm.runInNewContext(code, {
  exports: serviceExports, Error,
  require: (name) => {
    if (name === '@/lib/dataMode') return { getDataMode: () => 'supabase' };
    if (name === 'expo-crypto') return {
      CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
      digestStringAsync: async () => '0'.repeat(64),
    };
    if (name === '@/lib/supabase') return { supabase };
    if (name === 'expo-file-system') return {
      File: class { constructor() { fileReads += 1; throw new Error('File should be skipped.'); } },
    };
    throw new Error(`Unexpected import: ${name}`);
  },
});

(async () => {
  const result = await serviceExports.uploadCapture({
    sessionId: 'capture-test', clientPhotoId: 'client-photo-1', pageNumber: 1,
    uri: 'file:///missing-after-upload.jpg', mimeType: 'image/jpeg', capturedAt: row.captured_at,
  });
  assert.equal(JSON.stringify(result), JSON.stringify({
    id: captureId, sessionId: 'capture-test', clientPhotoId: 'client-photo-1', pageNumber: 1,
    storagePath: row.storage_path, mimeType: 'image/jpeg', capturedAt: row.captured_at, status: 'uploaded',
  }));
  assert.equal(fileReads, 0);
  assert.equal(storageCalls, 0);
  console.log('PASS: uploadCapture retry reuses the persisted page without reading or uploading the local file.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
