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

  const targetedJobId = crypto.randomUUID();
  const targetedSessionId = `targeted-claim-test-${targetedJobId}`;
  const otherOwnerId = crypto.randomUUID();
  psql(`
    insert into auth.users (id) values ('${otherOwnerId}');
    insert into public.processing_jobs
      (id, owner_id, capture_session_id, media_type, stage, total_count, uploaded_count)
      values ('${targetedJobId}', '${ownerId}', '${targetedSessionId}', 'photo', 'queued', 1, 0);
    update public.processing_jobs set stage = 'uploading' where id = '${targetedJobId}';
    update public.processing_jobs set stage = 'uploaded', uploaded_count = 1 where id = '${targetedJobId}';
  `);

  const wrongOwnerClaim = psql(
    `select id from public.claim_processing_job_by_id(
      '${targetedJobId}'::uuid, '${otherOwnerId}'::uuid, '${crypto.randomUUID()}'::uuid, 300
    );`,
    { tuplesOnly: true },
  ).trim();
  assert.equal(wrongOwnerClaim, '', 'a mismatched owner must not reveal or claim the targeted job');

  const targetedTokens = Array.from({ length: CONCURRENCY }, () => crypto.randomUUID());
  const targetedOutcomes = await Promise.all(
    targetedTokens.map(async (token) => {
      const stdout = await psqlAsync(
        `select pg_sleep(0.2); select id, runner_token from public.claim_processing_job_by_id(
          '${targetedJobId}'::uuid, '${ownerId}'::uuid, '${token}'::uuid, 300
        );`,
      );
      return { token, claimLine: stdout.split('\n').filter(Boolean).pop() ?? '' };
    }),
  );
  const targetedWinners = targetedOutcomes.filter((outcome) => outcome.claimLine.length > 0);
  assert.equal(targetedWinners.length, 1, 'exactly one concurrent targeted claim must win');
  assert.ok(targetedWinners[0].claimLine.includes(targetedJobId));
  assert.ok(targetedWinners[0].claimLine.includes(targetedWinners[0].token));

  const uploadFailureId = crypto.randomUUID();
  const backingOffId = crypto.randomUUID();
  const cappedId = crypto.randomUUID();
  psql(`
    insert into public.processing_jobs
      (id, owner_id, capture_session_id, media_type, stage, resume_stage, total_count, uploaded_count, retry_count, updated_at)
    values
      ('${uploadFailureId}', '${ownerId}', 'upload-failure-${uploadFailureId}', 'photo',
       'retryable_failed', 'uploading', 1, 0, 1, now() - interval '30 minutes'),
      ('${backingOffId}', '${ownerId}', 'backoff-${backingOffId}', 'photo',
       'retryable_failed', 'analyzing', 1, 1, 1, now()),
      ('${cappedId}', '${ownerId}', 'capped-${cappedId}', 'photo',
       'retryable_failed', 'filing', 1, 1, 3, now() - interval '30 minutes');
  `);

  for (const excluded of [uploadFailureId, backingOffId, cappedId]) {
    const result = psql(
      `select id from public.claim_processing_job_by_id(
        '${excluded}'::uuid, '${ownerId}'::uuid, '${crypto.randomUUID()}'::uuid, 300
      );`,
      { tuplesOnly: true },
    ).trim();
    assert.equal(result, '', `ineligible retryable job ${excluded} must not be claimed`);
  }
  const globalExcluded = psql(
    `select id from public.claim_next_processing_job('${crypto.randomUUID()}'::uuid, 300);`,
    { tuplesOnly: true },
  ).trim();
  assert.equal(globalExcluded, '', 'global recovery must exclude upload failures, active backoff, and capped jobs');

  psql(`update public.processing_jobs set updated_at = now() - interval '3 minutes' where id = '${backingOffId}';`);
  const targetedRetryToken = crypto.randomUUID();
  const resumedTarget = psql(
    `select id, stage, resume_stage, runner_token from public.claim_processing_job_by_id(
      '${backingOffId}'::uuid, '${ownerId}'::uuid, '${targetedRetryToken}'::uuid, 300
    );`,
    { tuplesOnly: true },
  ).trim();
  assert.equal(resumedTarget, `${backingOffId}|analyzing||${targetedRetryToken}`);

  psql(`
    update public.processing_jobs
    set stage = 'retryable_failed', resume_stage = 'analyzing', retry_count = 2,
        runner_token = null, lease_expires_at = null, updated_at = now() - interval '5 minutes'
    where id = '${backingOffId}';
  `);
  const globalRetryToken = crypto.randomUUID();
  const resumedGlobal = psql(
    `select id, stage, resume_stage, runner_token from public.claim_next_processing_job('${globalRetryToken}'::uuid, 300);`,
    { tuplesOnly: true },
  ).trim();
  assert.equal(resumedGlobal, `${backingOffId}|analyzing||${globalRetryToken}`);

  psql(`
    delete from public.processing_jobs where id in (
      '${jobId}', '${targetedJobId}', '${uploadFailureId}', '${backingOffId}', '${cappedId}'
    );
    delete from auth.users where id in ('${ownerId}', '${otherOwnerId}');
  `);

  console.log(
    `PASS: ${CONCURRENCY} concurrent claim_next_processing_job() calls on one 'uploaded' job -> ` +
      `exactly 1 winner; targeted ownership, server-stage retry backoff, upload exclusion, and retry cap verified.`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
