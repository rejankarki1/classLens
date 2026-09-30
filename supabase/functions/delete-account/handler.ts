import { Failure, cors, json } from '../_shared/ai.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bucket = 'lecture-materials';

type Config = {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
};

type Logger = Pick<Console, 'error'>;
type PathRow = { storage_path: string };
type StorageEntry = { name?: unknown; id?: unknown; metadata?: unknown };

async function request(
  fetcher: typeof fetch,
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  init: RequestInit = {},
): Promise<Response> {
  return fetcher(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) }, signal });
}

async function readPaths(
  fetcher: typeof fetch,
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<string[]> {
  const response = await request(fetcher, url, headers, signal);
  if (!response.ok) throw new Failure(502, 'DATABASE', 'Could not list account files.');
  const rows = await response.json() as PathRow[];
  if (!Array.isArray(rows) || rows.some((row) => typeof row.storage_path !== 'string')) {
    throw new Failure(502, 'DATABASE', 'Account file metadata was invalid.');
  }
  return rows.map((row) => row.storage_path).filter(Boolean);
}

async function listStorageFiles(
  fetcher: typeof fetch,
  origin: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  prefix: string,
): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;
  const limit = 1000;
  do {
    const response = await request(fetcher, `${origin}/storage/v1/object/list/${bucket}`, headers, signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!response.ok) throw new Failure(502, 'STORAGE', 'Account files could not be listed. Nothing was removed.');
    const entries = await response.json() as StorageEntry[];
    if (!Array.isArray(entries)) throw new Failure(502, 'STORAGE', 'Account file listing was invalid.');

    for (const entry of entries) {
      if (typeof entry.name !== 'string' || !entry.name || entry.name.includes('/')) {
        throw new Failure(502, 'STORAGE', 'Account file listing contained an unsafe path.');
      }
      const path = `${prefix}/${entry.name}`;
      if (entry.id == null && entry.metadata == null) files.push(...await listStorageFiles(fetcher, origin, headers, signal, path));
      else files.push(path);
    }
    if (entries.length < limit) break;
    offset += limit;
  } while (true);
  return files;
}

export function createHandler(config: Config, fetcher: typeof fetch = fetch, logger: Logger = console) {
  return async (incoming: Request): Promise<Response> => {
    if (incoming.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (incoming.method !== 'POST') return json({ error: { code: 'METHOD', message: 'Use POST.' } }, 405);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const origin = config.supabaseUrl.trim().replace(/\/$/, '');
      const publishableKey = config.publishableKey.trim();
      const serviceRoleKey = config.serviceRoleKey.trim();
      if (!origin || !publishableKey || !serviceRoleKey) {
        throw new Failure(503, 'CONFIGURATION', 'Account deletion is not configured.');
      }

      const authorization = incoming.headers.get('authorization');
      if (!authorization?.startsWith('Bearer ')) {
        throw new Failure(401, 'AUTH', 'Sign in again before deleting your account.');
      }

      // Do not trust a user id from the request body. Resolve it from the
      // presented JWT even though the platform also verifies JWTs for this function.
      const userResponse = await request(fetcher, `${origin}/auth/v1/user`, {
        apikey: publishableKey,
        Authorization: authorization,
      }, controller.signal);
      if (!userResponse.ok) throw new Failure(401, 'AUTH', 'Your session is no longer valid. Sign in again.');
      const user = await userResponse.json() as { id?: unknown };
      if (typeof user.id !== 'string' || !uuid.test(user.id)) {
        throw new Failure(401, 'AUTH', 'Authenticated user is invalid.');
      }
      const userId = user.id;
      const adminHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };

      const capturePaths = await readPaths(
        fetcher,
        `${origin}/rest/v1/captures?owner_id=eq.${userId}&select=storage_path`,
        adminHeaders,
        controller.signal,
      );
      const referencedCapturePaths = await readPaths(
        fetcher,
        `${origin}/rest/v1/captures?select=storage_path,lectures!inner(owner_id)&lectures.owner_id=eq.${userId}`,
        adminHeaders,
        controller.signal,
      );
      const materialPaths = await readPaths(
        fetcher,
        `${origin}/rest/v1/materials?select=storage_path,lectures!inner(owner_id)&lectures.owner_id=eq.${userId}`,
        adminHeaders,
        controller.signal,
      );
      const capturePrefix = `captures/${userId}`;
      const prefixedCapturePaths = await listStorageFiles(
        fetcher,
        origin,
        adminHeaders,
        controller.signal,
        capturePrefix,
      );
      const paths = [...new Set([
        ...capturePaths,
        ...referencedCapturePaths,
        ...prefixedCapturePaths,
        ...materialPaths,
      ])];

      for (let offset = 0; offset < paths.length; offset += 100) {
        const batch = paths.slice(offset, offset + 100);
        const storageResponse = await request(fetcher, `${origin}/storage/v1/object/${bucket}`, adminHeaders, controller.signal, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: batch }),
        });
        if (!storageResponse.ok) throw new Failure(502, 'STORAGE', 'Account files could not all be deleted. Database and Auth records were left unchanged.');
      }

      const dataResponse = await request(fetcher, `${origin}/rest/v1/rpc/delete_user_owned_data`, adminHeaders, controller.signal, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_user_id: userId }),
      });
      if (!dataResponse.ok) throw new Failure(502, 'DATABASE', 'Account records could not be deleted.');

      const authResponse = await request(fetcher, `${origin}/auth/v1/admin/users/${userId}`, adminHeaders, controller.signal, {
        method: 'DELETE',
      });
      if (!authResponse.ok) throw new Failure(502, 'AUTH_DELETE', 'Account records were removed, but Auth deletion needs to be retried.');

      return json({ deleted: true });
    } catch (error) {
      if (error instanceof Failure) return json({ error: { code: error.code, message: error.message } }, error.status);
      logger.error('[delete-account] unhandled', { message: error instanceof Error ? error.message : 'unknown' });
      return json({ error: { code: 'INTERNAL', message: 'Your account could not be deleted.' } }, 500);
    } finally {
      clearTimeout(timer);
    }
  };
}
