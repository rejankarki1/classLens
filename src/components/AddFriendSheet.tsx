import { useCallback, useEffect, useState } from 'react';

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/theme';
import { getInitials } from '@/features/profile/initials';

import { getCurrentUserId } from '@/services/auth';
import {
  acceptDemoFriendship,
  acceptFriendRequest,
  getFriendshipStates,
  getIncomingRequests,
  searchProfiles,
  sendFriendRequest,
} from '@/services/friends';
import type { FriendRequest, Profile } from '@/types';

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Lets Catch Up reload its friend list after a request is accepted. */
  onChanged: () => void;
};

export function AddFriendSheet({ visible, onClose, onChanged }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [states, setStates] = useState<Map<string, 'pending' | 'accepted'>>(new Map());
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searching, setSearching] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [incoming, current] = await Promise.all([
        getIncomingRequests(),
        getFriendshipStates(),
      ]);
      setRequests(incoming);
      setStates(current);
    } catch (caught) {
      setError(message(caught));
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setError('');
    // Friendships are authenticated-only by design, so check before querying.
    void getCurrentIn();

    async function getCurrentIn() {
      try {
        const id = await getCurrentUserId();
        if (!active) return;
        setSignedIn(id !== null);
        if (id) await refresh();
      } catch {
        if (active) setSignedIn(false);
      }
    }

    return () => { active = false; };
  }, [visible, refresh]);

  // Debounced so typing does not fire a query per keystroke.
  useEffect(() => {
    if (!visible || !signedIn) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchProfiles(term)
        .then((found) => { if (active) setResults(found); })
        .catch((caught) => { if (active) setError(message(caught)); })
        .finally(() => { if (active) setSearching(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query, visible, signedIn]);

  function close() {
    if (working) return;
    setQuery('');
    setResults([]);
    setError('');
    onClose();
  }

  async function add(profile: Profile) {
    if (working) return;
    setWorking(profile.id);
    setError('');
    try {
      // The seeded demo classmate has no account to accept from, so it uses the
      // demo-scoped path. Real classmates always go through a real request.
      if (profile.isDemo) {
        await acceptDemoFriendship(profile.id);
        onChanged();
      } else {
        await sendFriendRequest(profile.id);
      }
      await refresh();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setWorking(null);
    }
  }

  async function accept(request: FriendRequest) {
    if (working) return;
    setWorking(request.id);
    setError('');
    try {
      await acceptFriendRequest(request.id);
      await refresh();
      onChanged();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setWorking(null);
    }
  }

  // An absolute number beats a percentage here: the sheet's parent is
  // content-sized, so a percentage maxHeight resolves against nothing.
  const sheetMax = Math.round(height * 0.75);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={StyleSheet.absoluteFill}
          onPress={close}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.lift}
        >
          <View
            style={[
              styles.sheet,
              { maxHeight: sheetMax, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <ThemedText style={styles.eyebrow}>CATCHUPMATE</ThemedText>
                <ThemedText style={styles.title}>Add a classmate</ThemedText>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={10}
                onPress={close}
                style={({ pressed }) => [styles.close, pressed && styles.dim]}
              >
                <ThemedText allowFontScaling={false} style={styles.closeText}>×</ThemedText>
              </Pressable>
            </View>

            {signedIn === null ? (
              <View style={styles.centered}>
                <ActivityIndicator color={Brand.lime} accessibilityLabel="Loading" />
              </View>
            ) : signedIn === false ? (
              <View style={styles.signedOut}>
                <ThemedText style={styles.body}>
                  Sign in to add classmates. Catch Up shares notes between real
                  accounts, so friends need you signed in.
                </ThemedText>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sign in"
                  onPress={() => { onClose(); router.push('/login'); }}
                  style={({ pressed }) => [styles.primary, pressed && styles.dim]}
                >
                  <ThemedText style={styles.primaryText}>Sign in</ThemedText>
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search classmates by name"
                  placeholderTextColor="#9FB3A3"
                  autoCapitalize="words"
                  autoCorrect={false}
                  accessibilityLabel="Search classmates by name"
                  style={styles.input}
                />

                <ScrollView
                  style={styles.list}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.listContent}
                >
                  {requests.length ? (
                    <View style={styles.group}>
                      <ThemedText style={styles.label}>FRIEND REQUESTS</ThemedText>

                      {requests.map((request) => (
                        <View key={request.id} style={styles.row}>
                          <View style={styles.avatar}>
                            <ThemedText allowFontScaling={false} style={styles.avatarText}>
                              {getInitials(request.from.name) || '··'}
                            </ThemedText>
                          </View>

                          <View style={styles.rowCopy}>
                            <ThemedText style={styles.rowName}>{request.from.name}</ThemedText>
                            <ThemedText style={styles.rowMeta}>
                              {request.from.year} · {request.from.major}
                            </ThemedText>
                          </View>

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Accept ${request.from.name}`}
                            disabled={working !== null}
                            onPress={() => accept(request)}
                            style={({ pressed }) => [
                              styles.action,
                              (pressed || working !== null) && styles.dim,
                            ]}
                          >
                            {working === request.id
                              ? <ActivityIndicator color={Brand.ink} />
                              : <ThemedText style={styles.actionText}>Accept</ThemedText>}
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {searching ? (
                    <ActivityIndicator color={Brand.lime} accessibilityLabel="Searching" />
                  ) : null}

                  {!searching && query.trim().length >= 2 && results.length === 0 ? (
                    <ThemedText style={styles.rowMeta}>
                      No classmate found with that name.
                    </ThemedText>
                  ) : null}

                  {!searching && query.trim().length < 2 && requests.length === 0 ? (
                    <ThemedText style={styles.rowMeta}>
                      Type at least two letters of a classmate&apos;s name to find them.
                    </ThemedText>
                  ) : null}

                  {results.map((profile) => {
                    const state = states.get(profile.id);
                    return (
                      <View key={profile.id} style={styles.row}>
                        <View style={styles.avatar}>
                          <ThemedText allowFontScaling={false} style={styles.avatarText}>
                            {getInitials(profile.name) || '··'}
                          </ThemedText>
                        </View>

                        <View style={styles.rowCopy}>
                          <ThemedText style={styles.rowName}>{profile.name}</ThemedText>
                          <ThemedText style={styles.rowMeta}>
                            {profile.year} · {profile.major}
                          </ThemedText>
                        </View>

                        {state ? (
                          <View style={styles.badge}>
                            <ThemedText style={styles.badgeText}>
                              {state === 'accepted' ? 'Friends' : 'Pending'}
                            </ThemedText>
                          </View>
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Add ${profile.name}`}
                            disabled={working !== null}
                            onPress={() => add(profile)}
                            style={({ pressed }) => [
                              styles.action,
                              (pressed || working !== null) && styles.dim,
                            ]}
                          >
                            {working === profile.id
                              ? <ActivityIndicator color={Brand.ink} />
                              : <ThemedText style={styles.actionText}>Add</ThemedText>}
                          </Pressable>
                        )}
                      </View>
                    );
                  })}

                  {error ? (
                    <ThemedText accessibilityLiveRegion="polite" style={styles.error}>
                      {error}
                    </ThemedText>
                  ) : null}
                </ScrollView>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(9,23,17,0.66)' },
  lift: { width: '100%' },

  sheet: {
    width: '100%',
    backgroundColor: Brand.forest,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 14,
  },

  handle: {
    width: 38, height: 4, borderRadius: 999,
    backgroundColor: '#4E7060', alignSelf: 'center',
  },

  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerCopy: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: { color: Brand.lime, fontSize: 10, lineHeight: 16, letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 24, lineHeight: 30, fontWeight: '600' },

  close: {
    width: 34, height: 34, flexShrink: 0, borderRadius: 17,
    backgroundColor: '#1B3B2D', alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: '#DCE7DA', fontSize: 20, lineHeight: 24 },

  input: {
    minHeight: 50, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    color: '#FFFFFF', backgroundColor: '#1B3B2D',
    borderWidth: 1, borderColor: '#3D6350', fontSize: 16, lineHeight: 22,
  },

  // flexShrink lets the list give way to the keyboard instead of pushing the
  // sheet past the bottom of the screen.
  list: { flexShrink: 1 },
  listContent: { gap: 10, paddingBottom: 4 },

  group: { gap: 10 },
  label: { color: Brand.lime, fontSize: 10, lineHeight: 16, letterSpacing: 1 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, padding: 14, backgroundColor: '#1B3B2D',
  },
  avatar: {
    width: 40, height: 40, flexShrink: 0, borderRadius: 14,
    backgroundColor: '#2C5B43', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Brand.lime, fontSize: 13, fontWeight: '700' },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  rowMeta: { color: '#B9CEBF', fontSize: 13, lineHeight: 20 },

  action: {
    minHeight: 40, minWidth: 84, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 14, borderRadius: 12, backgroundColor: Brand.lime,
  },
  actionText: { color: Brand.ink, fontWeight: '700', fontSize: 14 },

  badge: {
    minHeight: 40, flexShrink: 0, justifyContent: 'center',
    paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#3D6350',
  },
  badgeText: { color: '#B9CEBF', fontSize: 13, fontWeight: '600' },

  signedOut: { gap: 14, paddingBottom: 4 },
  body: { color: '#DCE7DA', fontSize: 15, lineHeight: 23 },
  primary: {
    minHeight: 52, borderRadius: 16, backgroundColor: Brand.lime,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { color: Brand.ink, fontWeight: '700' },

  centered: { paddingVertical: 28, alignItems: 'center' },
  error: { color: '#F3C7C7', fontSize: 14, lineHeight: 21 },
  dim: { opacity: 0.6 },
});
