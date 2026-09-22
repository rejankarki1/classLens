const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const file = path.join(__dirname, 'notebookCorrections.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(dataMode, supabase) {
  const serviceExports = {};
  vm.runInNewContext(code, {
    exports: serviceExports, Error, Date, Map, Array,
    require: (name) => {
      if (name === '@/lib/dataMode') return { getDataMode: () => dataMode };
      if (name === '@/lib/supabase') return { supabase };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return serviceExports;
}

(async () => {
  // Mock mode: first save on a page fixes originalText; a second save on the
  // same page only replaces correctedText, matching the "tied to that page,
  // preserve the original" contract.
  const mock = load('mock', null);
  const first = await mock.saveNotebookCorrection({
    lectureId: 'lecture-1', captureId: 'capture-1', pageNumber: 2,
    originalText: 'Photosynthesis converts lihgt into energy.', correctedText: 'Photosynthesis converts light into energy.',
  });
  assert.equal(first.originalText, 'Photosynthesis converts lihgt into energy.');
  assert.equal(first.correctedText, 'Photosynthesis converts light into energy.');

  const second = await mock.saveNotebookCorrection({
    lectureId: 'lecture-1', captureId: 'capture-1', pageNumber: 2,
    originalText: 'This should be ignored: original_text is fixed on first save.', correctedText: 'Photosynthesis converts light into chemical energy.',
  });
  assert.equal(second.originalText, 'Photosynthesis converts lihgt into energy.', 'original_text must not change on a later edit');
  assert.equal(second.correctedText, 'Photosynthesis converts light into chemical energy.');

  const list = await mock.getNotebookCorrections('lecture-1');
  assert.equal(list.length, 1, 'a second edit updates the same page, not a new row');
  console.log('PASS: mock mode preserves original_text across repeat edits and stays one row per page.');

  await assert.rejects(
    () => mock.saveNotebookCorrection({ lectureId: 'lecture-1', captureId: null, pageNumber: 3, originalText: 'x', correctedText: '   ' }),
    /cannot be empty/,
  );
  console.log('PASS: an empty correction is rejected.');

  // Supabase mode: no existing row -> insert; existing row -> update only corrected_text/updated_at.
  let insertCalls = 0;
  let updateCalls = 0;
  let hasRow = false;
  const savedRow = {
    lecture_id: 'lecture-9', capture_id: 'capture-9', page_number: 1,
    original_text: 'raw extraction', corrected_text: 'raw extraction', updated_at: '2026-09-22T00:00:00.000Z',
  };
  const supabase = {
    from: (table) => {
      assert.equal(table, 'notebook_corrections');
      return {
        select: (columns) => {
          if (columns === 'id') {
            return { eq: () => ({ eq: () => ({ returns: () => ({ maybeSingle: async () => ({ data: hasRow ? { id: 'row-1' } : null, error: null }) }) }) }) };
          }
          return {
            eq: () => ({ order: () => ({ returns: async () => ({ data: [savedRow], error: null }) }) }),
          };
        },
        insert: (values) => {
          insertCalls += 1;
          assert.equal(values.lecture_id, 'lecture-9');
          assert.equal(values.original_text, 'raw extraction');
          hasRow = true;
          return {
            select: () => ({ returns: () => ({ single: async () => ({ data: { ...savedRow, corrected_text: values.corrected_text }, error: null }) }) }),
          };
        },
        update: (values) => {
          updateCalls += 1;
          assert.deepEqual(Object.keys(values).sort(), ['corrected_text', 'updated_at']);
          return {
            eq: () => ({
              select: () => ({ returns: () => ({ single: async () => ({ data: { ...savedRow, corrected_text: values.corrected_text }, error: null }) }) }),
            }),
          };
        },
      };
    },
  };
  const supabaseMode = load('supabase', supabase);

  const inserted = await supabaseMode.saveNotebookCorrection({
    lectureId: 'lecture-9', captureId: 'capture-9', pageNumber: 1, originalText: 'raw extraction', correctedText: 'fixed once',
  });
  assert.equal(inserted.correctedText, 'fixed once');
  assert.equal(insertCalls, 1);
  assert.equal(updateCalls, 0);

  const updated = await supabaseMode.saveNotebookCorrection({
    lectureId: 'lecture-9', captureId: 'capture-9', pageNumber: 1, originalText: 'ignored on update', correctedText: 'fixed twice',
  });
  assert.equal(updated.correctedText, 'fixed twice');
  assert.equal(insertCalls, 1, 'a second save on an already-corrected page must update, not insert again');
  assert.equal(updateCalls, 1);

  const rows = await supabaseMode.getNotebookCorrections('lecture-9');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].originalText, 'raw extraction');
  console.log('PASS: supabase mode inserts once then updates in place, never touching original_text.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
