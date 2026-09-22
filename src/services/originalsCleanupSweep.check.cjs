const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const file = path.join(__dirname, 'originalsCleanupSweep.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load({ userId, supabase }) {
  const removed = [];
  const serviceExports = {};
  vm.runInNewContext(code, {
    exports: serviceExports, Error,
    require: (name) => {
      if (name === './auth') return { getCurrentUserId: async () => userId };
      if (name === './processingLocal') return { removeStagedJobDirectory: (jobId) => removed.push(jobId) };
      if (name === '@/lib/supabase') return { supabase };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { serviceExports, removed };
}

(async () => {
  const signedOut = load({ userId: null, supabase: { from: () => { throw new Error('must not query while signed out'); } } });
  await signedOut.serviceExports.sweepLocalOriginals();
  assert.deepEqual(signedOut.removed, []);
  console.log('PASS: signed-out sweep makes no query and removes nothing.');

  let calls = 0;
  const confirmedJobs = [{ id: 'job-a' }, { id: 'job-b' }];
  const signedIn = load({
    userId: 'owner-1',
    supabase: {
      from: (table) => {
        assert.equal(table, 'processing_jobs');
        return {
          select: () => ({
            not: () => ({
              order: () => ({
                limit: () => ({
                  returns: async () => { calls += 1; return { data: confirmedJobs, error: null }; },
                }),
              }),
            }),
          }),
        };
      },
    },
  });
  await signedIn.serviceExports.sweepLocalOriginals();
  assert.equal(calls, 1);
  assert.deepEqual(signedIn.removed, ['job-a', 'job-b']);
  console.log('PASS: signed-in sweep clears the local directory for every confirmed-cleaned job.');

  const queryFailed = load({
    userId: 'owner-1',
    supabase: {
      from: () => ({
        select: () => ({
          not: () => ({
            order: () => ({
              limit: () => ({
                returns: async () => { throw new Error('network down'); },
              }),
            }),
          }),
        }),
      }),
    },
  });
  await queryFailed.serviceExports.sweepLocalOriginals();
  assert.deepEqual(queryFailed.removed, [], 'a failed sweep must never throw or block app usage');
  console.log('PASS: a failed query is swallowed -- best-effort, never blocks the app.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
