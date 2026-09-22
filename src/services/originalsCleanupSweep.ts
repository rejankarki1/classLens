import { getCurrentUserId } from './auth';
import { removeStagedJobDirectory } from './processingLocal';

/**
 * Session F foreground/launch sweep. Clears local staging copies only for
 * jobs the server has confirmed it deleted the cloud originals for
 * (`cleanup_completed_at` set) -- never on a local timer or guess. Best
 * effort: a failure here must never block the app from opening, and this
 * must never promise force-quit timing (device cleanup only runs while the
 * app is foregrounded or just launched).
 */
export async function sweepLocalOriginals(): Promise<void> {
  const ownerId = await getCurrentUserId();
  if (!ownerId) return;
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data, error } = await supabase
      .from('processing_jobs')
      .select('id')
      .not('cleanup_completed_at', 'is', null)
      .order('cleanup_completed_at', { ascending: false })
      .limit(20)
      .returns<{ id: string }[]>();
    if (error || !data) return;
    for (const job of data) removeStagedJobDirectory(job.id);
  } catch {
    // Best-effort only; a sweep failure must never block app usage.
  }
}
