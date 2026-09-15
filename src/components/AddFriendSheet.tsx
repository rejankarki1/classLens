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
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import {
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
  const theme = useTheme();
  const dark = theme.background !== Brand.paper;

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
    setError('');
    void refresh();
  }, [visible, refresh]);

  // Debounced so typing does not fire a query per keystroke.
  useEffect(() => {
    if (!visible) return;
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
  }, [query, visible]);

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
      await sendFriendRequest(profile.id);
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

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={close}
    >
      <Pressable style={styles.backdrop} onPress={close}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.background }]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={[styles.handle, { backgroundColor: theme.backgroundSelected }]} />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              <ThemedText themeColor="textSecondary" style={styles.eyebrow}>
                CATCHUPMATE
              </ThemedText>

              <ThemedText style={[styles.title, { color: theme.text }]}>
                Add a classmate.
              </ThemedText>

              <ThemedText themeColor="textSecondary" style={styles.description}>
                Search by name. Once they accept, their shared lectures show up in Catch Up.
              </ThemedText>

              {requests.length ? (
                <View style={styles.group}>
                  <ThemedText themeColor="textSecondary" style={styles.label}>
                    FRIEND REQUESTS
                  </ThemedText>

                  {requests.map((request) => (
                    <View
                      key={request.id}
                      style={[styles.row, {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.backgroundSelected,
                      }]}
                    >
                      <View style={styles.rowCopy}>
                        <ThemedText style={styles.rowName}>{request.from.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {request.from.year} · {request.from.major}
                        </ThemedText>
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Accept ${request.from.name}`}
                        disabled={working !== null}
                        onPress={() => accept(request)}
                        style={({ pressed }) => [
                          styles.rowAction,
                          { backgroundColor: dark ? Brand.lime : Brand.forest },
                          (pressed || working !== null) && styles.dim,
                        ]}
                      >
                        {working === request.id
                          ? <ActivityIndicator color={dark ? Brand.ink : '#FFFFFF'} />
                          : <ThemedText style={[styles.rowActionText, { color: dark ? Brand.ink : '#FFFFFF' }]}>Accept</ThemedText>}
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.group}>
                <ThemedText themeColor="textSecondary" style={styles.label}>
                  FIND A CLASSMATE
                </ThemedText>

                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search by name"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="words"
                  autoCorrect={false}
                  accessibilityLabel="Search classmates by name"
                  style={[styles.input, {
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.backgroundSelected,
                  }]}
                />

                {searching ? <ActivityIndicator color={theme.text} accessibilityLabel="Searching" /> : null}

                {!searching && query.trim().length >= 2 && results.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    No classmate found with that name.
                  </ThemedText>
                ) : null}

                {results.map((profile) => {
                  const state = states.get(profile.id);
                  return (
                    <View
                      key={profile.id}
                      style={[styles.row, {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.backgroundSelected,
                      }]}
                    >
                      <View style={styles.rowCopy}>
                        <ThemedText style={styles.rowName}>{profile.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {profile.year} · {profile.major}
                        </ThemedText>
                      </View>

                      {state ? (
                        <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
                          <ThemedText type="small" style={{ color: theme.text }}>
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
                            styles.rowAction,
                            { backgroundColor: dark ? Brand.lime : Brand.forest },
                            (pressed || working !== null) && styles.dim,
                          ]}
                        >
                          {working === profile.id
                            ? <ActivityIndicator color={dark ? Brand.ink : '#FFFFFF'} />
                            : <ThemedText style={[styles.rowActionText, { color: dark ? Brand.ink : '#FFFFFF' }]}>Add</ThemedText>}
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>

              {error ? (
                <ThemedText
                  accessibilityLiveRegion="polite"
                  style={[styles.error, { color: dark ? '#E7A6A6' : '#8C3B3B' }]}
                >
                  {error}
                </ThemedText>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                disabled={working !== null}
                onPress={close}
                style={({ pressed }) => [
                  styles.action,
                  { backgroundColor: theme.backgroundSelected },
                  pressed && styles.dim,
                ]}
              >
                <ThemedText style={[styles.actionText, { color: theme.text }]}>Done</ThemedText>
              </Pressable>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(9,23,17,0.66)' },
  sheet: {
    maxHeight: '90%', borderTopLeftRadius: 34, borderTopRightRadius: 34,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36,
  },
  content: { gap: 16, paddingBottom: 12 },
  handle: { width: 44, height: 5, borderRadius: 999, alignSelf: 'center', marginBottom: 16 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontFamily: Fonts.serif, fontSize: 30, lineHeight: 36, letterSpacing: -1 },
  description: { fontSize: 14, lineHeight: 21 },
  group: { gap: 8 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  input: {
    minHeight: 54, borderRadius: 17, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, lineHeight: 23, borderWidth: 1,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 18, borderWidth: 1, padding: 14,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowAction: {
    minHeight: 40, minWidth: 82, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 14, borderRadius: 13,
  },
  rowActionText: { fontWeight: '700', fontSize: 14 },
  badge: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 13 },
  error: { fontSize: 14, lineHeight: 21 },
  action: { minHeight: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontWeight: '700' },
  dim: { opacity: 0.6 },
});
