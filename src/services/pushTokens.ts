import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getDataMode } from '@/lib/dataMode';

type PushTokenRow = { expo_push_token: string };

/** Kept in memory only: lets removal target the exact row without a round trip. */
let lastRegisteredToken: string | null = null;

function currentPlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS;
  return null;
}

/**
 * Registers this device's Expo push token after permission has been granted.
 * Never throws: a missing EAS project association, a denied permission, or
 * any provider failure all resolve silently -- push is speed-of-notice only,
 * never a correctness dependency (Home remains the recovery path).
 */
export async function registerDeviceToken(): Promise<void> {
  if (getDataMode() !== 'supabase') return;
  try {
    const permission = await Notifications.getPermissionsAsync();
    const allowed = permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!allowed) return;

    const platform = currentPlatform();
    if (!platform) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!expoPushToken) return;

    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    const ownerId = session?.user.id;
    if (!ownerId) return;

    // Not a Postgres upsert: its ON CONFLICT DO UPDATE would need to SET
    // owner_id (it's in the payload), and owner_id is deliberately excluded
    // from the update grant so a token can never be silently reassigned
    // between accounts. Check-then-insert-or-update instead, matching
    // notebookCorrections.ts/quizAttempts.ts's existing convention. RLS
    // scopes this select to rows we own, so a token already owned by a
    // different account (e.g. reused after a reinstall) is invisible here
    // and falls through to insert, which then fails on the unique
    // constraint rather than reassigning ownership.
    const { data: existing, error: existingError } = await supabase
      .from('device_push_tokens')
      .select('id')
      .eq('expo_push_token', expoPushToken)
      .returns<{ id: string }[]>()
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      const { error } = await supabase
        .from('device_push_tokens')
        .update({ platform, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('device_push_tokens')
        .insert({ owner_id: ownerId, expo_push_token: expoPushToken, platform });
      if (error) throw error;
    }

    if (lastRegisteredToken && lastRegisteredToken !== expoPushToken) {
      await supabase.from('device_push_tokens').delete().eq('expo_push_token', lastRegisteredToken);
    }
    lastRegisteredToken = expoPushToken;
  } catch {
    // Registration is best-effort; a denied permission or missing EAS project
    // must never block sign-in, sign-out, or any other flow.
  }
}

/**
 * Removes this device's registered token, e.g. on logout. Best-effort: must
 * never block the sign-out it runs ahead of.
 */
export async function removeMyDeviceTokens(): Promise<void> {
  if (getDataMode() !== 'supabase') return;
  try {
    const { supabase } = await import('@/lib/supabase');
    if (lastRegisteredToken) {
      await supabase.from('device_push_tokens').delete().eq('expo_push_token', lastRegisteredToken).returns<PushTokenRow[]>();
      lastRegisteredToken = null;
      return;
    }
    // No token known in this process (e.g. app relaunch): fall back to
    // removing every token owned by the signed-in user. Single-device
    // assumption -- acceptable since a stale token elsewhere is harmless
    // (it simply stops receiving pushes once it 404s on send).
    const { data: { session } } = await supabase.auth.getSession();
    const ownerId = session?.user.id;
    if (!ownerId) return;
    await supabase.from('device_push_tokens').delete().eq('owner_id', ownerId);
  } catch {
    // Sign-out must proceed regardless of token cleanup failures.
  }
}
