import { getDataMode } from '@/lib/dataMode';
import type { Profile, ProfileInput } from '@/types';

const profileColumns = 'id, name, year, major';

function requireSupabase(action: string) {
  if (getDataMode() !== 'supabase') {
    throw new Error(`${action} requires EXPO_PUBLIC_DATA_MODE=supabase.`);
  }
}

/** Current user ID, or null when signed out. Never exposes auth fields. */
export async function getCurrentUserId(): Promise<string | null> {
  if (getDataMode() !== 'supabase') return null;
  const { supabase } = await import('@/lib/supabase');
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Fires on sign in, sign out and token refresh so the app can re-gate. */
export async function onAuthChange(listener: (userId: string | null) => void): Promise<() => void> {
  if (getDataMode() !== 'supabase') {
    listener(null);
    return () => {};
  }
  const { supabase } = await import('@/lib/supabase');
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    listener(session?.user.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export async function signUp(email: string, password: string): Promise<void> {
  requireSupabase('Sign up');
  const address = email.trim();
  if (!address) throw new Error('Email is required.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');

  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.auth.signUp({ email: address, password });
  if (error) throw new Error(error.message);
  // Email confirmation leaves no session; the app cannot continue without one.
  if (!data.session) {
    throw new Error('Account created, but email confirmation is on. Disable it in Supabase Auth settings for this demo, then sign in.');
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  requireSupabase('Sign in');
  const address = email.trim();
  if (!address || !password) throw new Error('Email and password are required.');

  const { supabase } = await import('@/lib/supabase');
  const { error } = await supabase.auth.signInWithPassword({ email: address, password });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  requireSupabase('Sign out');
  const { supabase } = await import('@/lib/supabase');
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

/** Null means onboarding has not been completed yet. */
export async function getMyProfile(): Promise<Profile | null> {
  if (getDataMode() !== 'supabase') return null;
  const { supabase } = await import('@/lib/supabase');
  const { data: session } = await supabase.auth.getSession();
  const id = session.session?.user.id;
  if (!id) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(profileColumns)
    .eq('id', id)
    .returns<Profile[]>()
    .maybeSingle();

  if (error) throw new Error(`Could not load your profile: ${error.message}`);
  return data;
}

/** Completes onboarding, and later edits. Writes only the signed-in user's row. */
export async function saveMyProfile(input: ProfileInput): Promise<Profile> {
  requireSupabase('Saving your profile');
  const name = input.name.trim();
  const major = input.major.trim();
  if (!name) throw new Error('Your name is required.');
  if (!major) throw new Error('Your major or program is required.');

  const { supabase } = await import('@/lib/supabase');
  const { data: session } = await supabase.auth.getSession();
  const id = session.session?.user.id;
  if (!id) throw new Error('You are signed out. Sign in and try again.');

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id, name, year: input.year, major })
    .select(profileColumns)
    .returns<Profile[]>()
    .single();

  if (error) throw new Error(`Could not save your profile: ${error.message}`);
  if (!data) throw new Error('No saved profile was returned.');
  return data;
}
