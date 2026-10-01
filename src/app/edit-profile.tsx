import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/Screen';
import { Brand, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getMyProfile, saveMyProfile } from '@/services/auth';
import { years, type Year } from '@/types';

export default function EditProfileScreen() {
  const theme = useTheme();
  const dark = theme.background !== Brand.paper;
  const majorRef = useRef<TextInput>(null);
  const [name, setName] = useState('');
  const [year, setYear] = useState<Year | null>(null);
  const [major, setMajor] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    void getMyProfile().then((profile) => {
      if (!active || !profile) return;
      setName(profile.name);
      setYear(profile.year);
      setMajor(profile.major);
    }).catch(() => {
      if (active) setError('Could not load your profile.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []));

  const ready = name.trim().length > 0 && year !== null && major.trim().length > 0;
  const input = [styles.input, {
    color: theme.text,
    backgroundColor: theme.backgroundElement,
    borderColor: theme.backgroundSelected,
  }];

  async function save() {
    Keyboard.dismiss();
    if (!ready || !year || busy) return;
    setBusy(true);
    setError('');
    try {
      await saveMyProfile({ name, year, major });
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your profile.');
      setBusy(false);
    }
  }

  return (
    <Screen avoidKeyboard headerAbove>
      <View style={styles.intro}>
        <ThemedText type="title" style={styles.title}>Edit your profile</ThemedText>
        <ThemedText themeColor="textSecondary">Keep the details classmates see up to date.</ThemedText>
      </View>

      {loading ? <ActivityIndicator color={Brand.forest} accessibilityLabel="Loading profile" /> : (
        <>
          <View style={styles.field}>
            <ThemedText themeColor="textSecondary" style={styles.label}>FULL NAME</ThemedText>
            <TextInput value={name} onChangeText={setName} editable={!busy} autoCapitalize="words"
              returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => majorRef.current?.focus()}
              accessibilityLabel="Full name" style={input} />
          </View>

          <View style={styles.field}>
            <ThemedText themeColor="textSecondary" style={styles.label}>CLASSIFICATION</ThemedText>
            <View style={styles.chips}>
              {years.map((option) => {
                const active = year === option;
                return (
                  <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: active, disabled: busy }}
                    disabled={busy} onPress={() => setYear(option)} style={({ pressed }) => [styles.chip, {
                      backgroundColor: active ? (dark ? Brand.lime : Brand.forest) : theme.backgroundElement,
                      borderColor: active ? (dark ? Brand.lime : Brand.forest) : theme.backgroundSelected,
                    }, pressed && styles.dim]}>
                    <ThemedText style={[styles.chipText, { color: active ? (dark ? Brand.ink : '#FFFFFF') : theme.text }]}>{option}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText themeColor="textSecondary" style={styles.label}>MAJOR OR PROGRAM</ThemedText>
            <TextInput ref={majorRef} value={major} onChangeText={setMajor} editable={!busy}
              returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={save}
              accessibilityLabel="Major or program" style={input} />
          </View>

          {error ? <ThemedText accessibilityLiveRegion="polite" style={styles.error}>{error}</ThemedText> : null}

          <Pressable accessibilityRole="button" accessibilityLabel="Save profile"
            accessibilityState={{ disabled: !ready || busy, busy }} disabled={!ready || busy} onPress={save}
            style={({ pressed }) => [styles.action, { backgroundColor: dark ? Brand.lime : Brand.forest },
              (pressed || !ready || busy) && styles.dim]}>
            {busy ? <ActivityIndicator color={dark ? Brand.ink : '#FFFFFF'} />
              : <ThemedText style={[styles.actionText, { color: dark ? Brand.ink : '#FFFFFF' }]}>Save profile</ThemedText>}
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 10 },
  title: { fontFamily: Fonts.serif, fontWeight: '400' },
  field: { gap: 7 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  input: { minHeight: 54, borderRadius: 17, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, lineHeight: 23, borderWidth: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 14, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '600' },
  error: { color: '#8C3B3B', fontSize: 14, lineHeight: 21 },
  action: { minHeight: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontWeight: '700' },
  dim: { opacity: 0.6 },
});
