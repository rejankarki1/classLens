'use strict';

// Proves the Session B claim/lease primitive: concurrent calls to
// claim_next_processing_job() racing for the same 'uploaded' job never
// double-claim it. Runs against a real local Postgres (via `supabase start`)
// because this is a row-locking race that a JS mock cannot reproduce --
// it needs actual concurrent connections and MVCC/FOR UPDATE SKIP LOCKED
// behavior.
//
// Usage: npx supabase start   (applies all migrations locally, once)
//        node supabase/tests/claim_next_processing_job.check.cjs

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const DB_URL = process.env.CLASSLENS_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const CONCURRENCY = 8;

function psql(sql, { tuplesOnly = false } = {}) {
  const args = tuplesOnly
    ? ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', DB_URL]
    : ['-X', '-q', '-v', 'ON_ERROR_STOP=1', DB_URL];
  const result = spawnSync('psql', args, { input: sql, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`psql failed (exit ${result.status}):\n${result.stderr}\nSQL was:\n${sql}`);
  }
  return result.stdout;
}

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', DB_URL], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`psql failed: ${stderr}`));
      else resolve(stdout.trim());
    });
    child.stdin.write(sql);
    child.stdin.end();
  });
}

(async () => {
  const ownerId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const sessionId = `claim-lease-test-${jobId}`;

  psql(`
    delete from public.processing_jobs where capture_session_id = '${sessionId}';
    delete from auth.users where id = '${ownerId}';
    insert into auth.users (id) values ('${ownerId}');
    insert into public.processing_jobs
      (id, owner_id, capture_session_id, media_type, stage, total_count, uploaded_count)
      values ('${jobId}', '${ownerId}', '${sessionId}', 'photo', 'queued', 1, 0);
    update public.processing_jobs set stage = 'uploading' where id = '${jobId}';
    update public.processing_jobs set stage = 'uploaded', uploaded_count = 1 where id = '${jobId}';
  `);

  const before = psql(
    `select stage, runner_token, claimed_at from public.processing_jobs where id = '${jobId}';`,
    { tuplesOnly: true },
  ).trim();
  assert.equal(before, 'uploaded||', `seed job must start 'uploaded' with no lease, got "${before}"`);

  // Every connection sleeps first so all CONCURRENCY processes finish
  // connecting and wake up to call claim_next_processing_job() at roughly
  // the same instant, forcing genuine contention on the single candidate row
  // rather than relying on accidental process-scheduling overlap.
  const tokens = Array.from({ length: CONCURRENCY }, () => crypto.randomUUID());
  const outcomes = await Promise.all(
    tokens.map(async (token) => {
      const stdout = await psqlAsync(
        `select pg_sleep(0.2); select id, runner_token from public.claim_next_processing_job('${token}'::uuid, 300);`,
      );
      const claimLine = stdout.split('\n').filter(Boolean).pop() ?? '';
      return { token, claimLine };
    }),
  );

  const winners = outcomes.filter((o) => o.claimLine.length > 0);
  assert.equal(
    winners.length,
    1,
    `exactly one concurrent claim must win; got ${winners.length} of ${CONCURRENCY}: ${JSON.stringify(outcomes)}`,
  );
  const winnerToken = winners[0].token;
  assert.ok(winners[0].claimLine.includes(jobId), 'the winning claim must return the seeded job row');
  assert.ok(winners[0].claimLine.includes(winnerToken), 'the returned row must carry the winning runner token');

  const after = psql(
    `select stage, runner_token, (claimed_at is not null), (lease_expires_at > now())
       from public.processing_jobs where id = '${jobId}';`,
    { tuplesOnly: true },
  ).trim();
  assert.equal(
    after,
    `analyzing|${winnerToken}|t|t`,
    `job must end claimed exactly once by the winning token, got "${after}"`,
  );

  psql(`delete from public.processing_jobs where id = '${jobId}'; delete from auth.users where id = '${ownerId}';`);

  console.log(
    `PASS: ${CONCURRENCY} concurrent claim_next_processing_job() calls on one 'uploaded' job -> ` +
      `exactly 1 winner (${winnerToken}), ${CONCURRENCY - 1} no-ops, no double-claim.`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
