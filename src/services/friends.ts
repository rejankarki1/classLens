import { getDataMode } from '@/lib/dataMode';
import type { FriendRequest, Profile } from '@/types';

const profileColumns = 'id, name, year, major, is_demo';

function requireSupabase(action: string) {
  if (getDataMode() !== 'supabase') {
    throw new Error(`${action} requires EXPO_PUBLIC_DATA_MODE=supabase.`);
  }
}

async function session() {
  const { supabase } = await import('@/lib/supabase');
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('You are signed out. Sign in and try again.');
  return { supabase, id };
}

type ProfileRow = {
  id: string;
  name: string;
  year: Profile['year'];
  major: string;
  is_demo: boolean | null;
};

function toProfile(row: ProfileRow): Profile {
  return { id: row.id, name: row.name, year: row.year, major: row.major, isDemo: row.is_demo === true };
}

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
};

/**
 * Find classmates by name. Email is never searchable because it lives in
 * auth.users, which is deliberately not exposed to clients.
 */
export async function searchProfiles(query: string): Promise<Profile[]> {
  requireSupabase('Finding classmates');
  const term = query.trim();
  if (term.length < 2) return [];

  const { supabase, id } = await session();
  const { data, error } = await supabase
    .from('profiles')
    .select(profileColumns)
    .ilike('name', `%${term}%`)
    .neq('id', id)
    .order('name')
    .limit(20)
    .returns<ProfileRow[]>();

  if (error) throw new Error(`Could not search classmates: ${error.message}`);
  return data.map(toProfile);
}

/** Every friendship involving the signed-in user, in either direction. */
async function myFriendships(): Promise<{ rows: FriendshipRow[]; id: string }> {
  const { supabase, id } = await session();
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(`requester_id.eq.${id},addressee_id.eq.${id}`)
    .returns<FriendshipRow[]>();

  if (error) throw new Error(`Could not load your friends: ${error.message}`);
  return { rows: data, id };
}

async function profilesByIds(ids: string[]): Promise<Map<string, Profile>> {
  if (!ids.length) return new Map();
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('profiles')
    .select(profileColumns)
    .in('id', ids)
    .returns<ProfileRow[]>();

  if (error) throw new Error(`Could not load classmate profiles: ${error.message}`);
  return new Map(data.map((row) => [row.id, toProfile(row)]));
}

/** Accepted friends only. This is what Catch Up lists. */
export async function getFriends(): Promise<Profile[]> {
  if (getDataMode() !== 'supabase') return [];
  const { rows, id } = await myFriendships();
  const accepted = rows.filter((row) => row.status === 'accepted');
  const others = accepted.map((row) => (row.requester_id === id ? row.addressee_id : row.requester_id));
  const profiles = await profilesByIds(others);
  return others
    .map((other) => profiles.get(other))
    .filter((profile): profile is Profile => profile !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Pending requests addressed to the signed-in user, waiting to be accepted. */
export async function getIncomingRequests(): Promise<FriendRequest[]> {
  if (getDataMode() !== 'supabase') return [];
  const { rows, id } = await myFriendships();
  const incoming = rows.filter((row) => row.status === 'pending' && row.addressee_id === id);
  const profiles = await profilesByIds(incoming.map((row) => row.requester_id));
  return incoming
    .map((row) => {
      const from = profiles.get(row.requester_id);
      return from ? { id: row.id, from } : null;
    })
    .filter((request): request is FriendRequest => request !== null);
}

/** IDs already requested or accepted, so the UI can show Pending or Friends. */
export async function getFriendshipStates(): Promise<Map<string, 'pending' | 'accepted'>> {
  if (getDataMode() !== 'supabase') return new Map();
  const { rows, id } = await myFriendships();
  return new Map(
    rows.map((row) => [row.requester_id === id ? row.addressee_id : row.requester_id, row.status]),
  );
}

export async function sendFriendRequest(addresseeId: string): Promise<void> {
  requireSupabase('Sending a friend request');
  const { supabase, id } = await session();
  if (addresseeId === id) throw new Error('You cannot add yourself.');

  // status is not grantable, so the row always starts pending.
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: id, addressee_id: addresseeId });

  if (error) {
    // The unique pair index covers both directions.
    if (error.code === '23505') throw new Error('You are already connected with this classmate.');
    throw new Error(`Could not send the request: ${error.message}`);
  }
}

/** Only the addressee can accept, enforced by the update policy. */
export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  requireSupabase('Accepting a friend request');
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Could not accept the request: ${error.message}`);
  if (!data) throw new Error('That request is no longer pending.');
}


/**
 * Demo-only: befriend the seeded classmate without a second device. The database
 * function refuses any profile that is not flagged is_demo, so this cannot force
 * a friendship with a real account, and it is granted to authenticated only.
 * Real requests still go through sendFriendRequest and a real acceptance.
 */
export async function acceptDemoFriendship(demoProfileId: string): Promise<void> {
  requireSupabase('Adding the demo classmate');
  const { supabase } = await session();
  const { error } = await supabase.rpc('accept_demo_friendship', { demo_id: demoProfileId });
  if (error) throw new Error(`Could not add the demo classmate: ${error.message}`);
}

/** Read one profile without needing a session, for the signed-out demo path. */
export async function getProfileById(id: string): Promise<Profile | null> {
  if (getDataMode() !== 'supabase' || !id.trim()) return null;
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('profiles')
    .select(profileColumns)
    .eq('id', id)
    .returns<ProfileRow[]>()
    .maybeSingle();
  if (error || !data) return null;
  return toProfile(data);
}
