import { Failure, json, cors } from '../_shared/ai.ts';

// Session F: deletes cloud photo originals for jobs whose 7-day retention
// window has passed, verifies absence, and records the result so a partial
// failure retries on the next invocation. Never deletes captures/lectures
// rows or notebook text -- only the Storage blobs (plan §7: "Keep notebook
// text, extraction, correction, page references, analysis, and job audit").
//
// Same two-trusted-caller shape as process-job (see its README): a signed-in
// ClassLens user (for manual/dry-run testing before the schedule is trusted),
// or the exact CLEANUP_CRON_SECRET value -- the pg_cron schedule in
// supabase/migrations/20260922040000_cleanup_originals_cron.sql, registered
// but INACTIVE until deliberately turned on.

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bucket = 'lecture-materials';
const defaultBatchSize = 5;

type Config = {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  cronSecret?: string;
  batchSize?: number;
};

type Logger = Pick<Console, 'log' | 'error'>;
type JobRow = { id: string; owner_id: string; total_count: number };
type CaptureRow = { id: string; storage_path: string };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function log(logger: Logger, level: 'log' | 'error', event: string, details: Record<string, unknown> = {}) {
  logger[level](`[cleanup-originals] ${event}`, details);
}

async function rest(fetcher: typeof fetch, url: string, headers: Record<string, string>, signal: AbortSignal, init: RequestInit = {}) {
  return fetcher(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) }, signal });
}

async function markResult(
  fetcher: typeof fetch, origin: string, headers: Record<string, string>, signal: AbortSignal,
  jobId: string, values: Record<string, unknown>,
): Promise<void> {
  await rest(fetcher, `${origin}/rest/v1/processing_jobs?id=eq.${jobId}`, headers, signal, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
  });
}

export function createHandler(config: Config, fetcher: typeof fetch = fetch, logger: Logger = console) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: { code: 'METHOD', message: 'Use POST.' } }, 405);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      if (!config.supabaseUrl.trim() || !config.publishableKey.trim() || !config.serviceRoleKey.trim()) {
        throw new Failure(503, 'CONFIGURATION', 'Cleanup worker is not configured.');
      }
      // Same trust model as process-job: a signed-in user JWT, or the exact
      // pg_cron secret -- never an anonymous caller with neither.
      const authorization = request.headers.get('authorization');
      if (!authorization?.startsWith('Bearer ')) throw new Failure(401, 'AUTH', 'Sign in to trigger cleanup.');
      const origin = config.supabaseUrl.replace(/\/$/, '');
      const presented = authorization.slice('Bearer '.length);
      const isTrustedCron = Boolean(config.cronSecret?.trim()) && timingSafeEqual(presented, config.cronSecret!.trim());
      if (!isTrustedCron) {
        const userHeaders = { apikey: config.publishableKey.trim(), Authorization: authorization };
        const userResponse = await rest(fetcher, `${origin}/auth/v1/user`, userHeaders, controller.signal);
        if (!userResponse.ok) throw new Failure(401, 'AUTH', 'Your session is no longer valid. Sign in again.');
        const user = await userResponse.json();
        if (!user || typeof user.id !== 'string' || !uuid.test(user.id)) throw new Failure(401, 'AUTH', 'Authenticated user is invalid.');
      }

      const headers = { apikey: config.serviceRoleKey.trim(), Authorization: `Bearer ${config.serviceRoleKey.trim()}` };
      const batchSize = config.batchSize ?? defaultBatchSize;

      // stage=completed alone excludes failed/course_needed/review-needed; a
      // job never reaches cleanup_eligible_at without also being completed
      // (Session E's check constraint), so this is exactly plan §9's
      // "completed/filed only" eligibility set.
      const eligibleResponse = await rest(fetcher,
        `${origin}/rest/v1/processing_jobs?stage=eq.completed&cleanup_completed_at=is.null`
        + `&cleanup_eligible_at=lte.${encodeURIComponent(new Date().toISOString())}`
        + `&select=id,owner_id,total_count&order=cleanup_eligible_at.asc&limit=${batchSize}`,
        headers, controller.signal);
      if (!eligibleResponse.ok) throw new Failure(502, 'DATABASE', 'Could not list cleanup-eligible jobs.');
      const jobs = (await eligibleResponse.json()) as JobRow[];
      if (!Array.isArray(jobs)) throw new Failure(502, 'DATABASE', 'Invalid eligible-jobs response.');

      let succeeded = 0;
      let failed = 0;
      for (const job of jobs) {
        const now = new Date().toISOString();
        try {
          const capturesResponse = await rest(fetcher,
            `${origin}/rest/v1/captures?processing_job_id=eq.${job.id}&select=id,storage_path`,
            headers, controller.signal);
          if (!capturesResponse.ok) throw new Error('Could not read job captures.');
          const captures = (await capturesResponse.json()) as CaptureRow[];
          if (!Array.isArray(captures) || captures.length !== job.total_count) {
            throw new Error('Uploaded captures do not match the job; refusing to delete.');
          }
          const paths = captures.map((capture) => capture.storage_path);

          if (paths.length === 0) {
            await markResult(fetcher, origin, headers, controller.signal, job.id, {
              cleanup_attempted_at: now, cleanup_completed_at: now, last_cleanup_error: null,
            });
            succeeded += 1;
            continue;
          }

          const deleteResponse = await rest(fetcher, `${origin}/storage/v1/object/${bucket}`, headers, controller.signal, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefixes: paths }),
          });
          if (!deleteResponse.ok) throw new Error(`Storage delete failed with status ${deleteResponse.status}.`);
          let removed: unknown;
          try { removed = await deleteResponse.json(); } catch { throw new Error('Invalid storage delete response.'); }
          const removedNames = new Set(
            Array.isArray(removed) ? removed.map((entry) => (entry as { name?: unknown }).name) : [],
          );
          // The bulk-remove response lists exactly the objects it found and
          // deleted (mirrors src/services/materials.ts's own remove()
          // verification idiom: a returned entry per path is the only proof
          // Storage needs to confirm that path is now gone).
          const missing = paths.filter((path) => !removedNames.has(path));
          if (missing.length) throw new Error(`Deletion unconfirmed for ${missing.length} of ${paths.length} object(s).`);

          await markResult(fetcher, origin, headers, controller.signal, job.id, {
            cleanup_attempted_at: now, cleanup_completed_at: now, last_cleanup_error: null,
          });
          succeeded += 1;
          log(logger, 'log', 'cleaned', { jobId: job.id, ownerId: job.owner_id, objects: paths.length });
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : 'Unknown cleanup error.';
          log(logger, 'error', 'cleanup-failed', { jobId: job.id, message });
          await markResult(fetcher, origin, headers, controller.signal, job.id, {
            cleanup_attempted_at: now, last_cleanup_error: message.slice(0, 500),
          }).catch(() => undefined);
        }
      }

      return json({ processed: jobs.length, succeeded, failed });
    } catch (error) {
      if (error instanceof Failure) return json({ error: { code: error.code, message: error.message } }, error.status);
      log(logger, 'error', 'unhandled', { message: error instanceof Error ? error.message : 'unknown' });
      return json({ error: { code: 'INTERNAL', message: 'Cleanup could not run.' } }, 500);
    } finally {
      clearTimeout(timer);
    }
  };
}
