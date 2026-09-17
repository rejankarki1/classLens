import { useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ClassLensLogo } from '@/components/ClassLensLogo';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/Screen';
import { Brand, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { saveMyProfile } from '@/services/auth';
import { years, type Year } from '@/types';

export default function OnboardingScreen() {
  const theme = useTheme();
  const dark = theme.background !== Brand.paper;
  const [name, setName] = useState('');
  const [year, setYear] = useState<Year | null>(null);
  const [major, setMajor] = useState('');
  const majorRef = useRef<TextInput>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = name.trim().length > 0 && year !== null && major.trim().length > 0;

  async function submit() {
    Keyboard.dismiss();
    if (!ready || busy || !year) return;
    setBusy(true);
    setError('');
    try {
      await saveMyProfile({ name, year, major });
      // The root layout moves on once the profile exists.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your profile.');
      setBusy(false);
    }
  }

  const input = [styles.input, {
    color: theme.text,
    backgroundColor: theme.backgroundElement,
    borderColor: theme.backgroundSelected,
  }];

  return (
    <Screen avoidKeyboard>
      <View style={styles.header}>
        <ClassLensLogo compact />
      </View>

      <View style={styles.intro}>
        <ThemedText type="title" style={styles.title}>
          Tell us who you are.
        </ThemedText>

        <ThemedText themeColor="textSecondary">
          Three quick things, so classmates can find you and ClassLens fits your program.
        </ThemedText>
      </View>

      <View style={styles.field}>
        <ThemedText themeColor="textSecondary" style={styles.label}>FULL NAME</ThemedText>
        <TextInput
          value={name}
          onChangeText={setName}
          editable={!busy}
          placeholder="Alex Rivera"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => majorRef.current?.focus()}
          accessibilityLabel="Full name, required"
          style={input}
        />
      </View>

      <View style={styles.field}>
        <ThemedText themeColor="textSecondary" style={styles.label}>YEAR</ThemedText>
        <View style={styles.chips}>
          {years.map((option) => {
            const active = year === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={option}
                accessibilityState={{ selected: active, disabled: busy }}
                disabled={busy}
                onPress={() => {
                  Keyboard.dismiss();
                  setYear(option);
                }}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: active
                      ? (dark ? Brand.lime : Brand.forest)
                      : theme.backgroundElement,
                    borderColor: active
                      ? (dark ? Brand.lime : Brand.forest)
                      : theme.backgroundSelected,
                  },
                  pressed && styles.dim,
                ]}
              >
                <ThemedText
                  style={[
                    styles.chipText,
                    { color: active ? (dark ? Brand.ink : '#FFFFFF') : theme.text },
                  ]}
                >
                  {option}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.field}>
        <ThemedText themeColor="textSecondary" style={styles.label}>MAJOR OR PROGRAM</ThemedText>
        <TextInput
          ref={majorRef}
          value={major}
          onChangeText={setMajor}
          editable={!busy}
          placeholder="Computer Science"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={submit}
          accessibilityLabel="Major or program, required"
          style={input}
        />
      </View>

      {error ? (
        <ThemedText accessibilityLiveRegion="polite" style={[styles.error, { color: dark ? '#E7A6A6' : '#8C3B3B' }]}>
          {error}
        </ThemedText>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Enter ClassLens"
        accessibilityState={{ disabled: !ready || busy, busy }}
        disabled={!ready || busy}
        onPress={submit}
        style={({ pressed }) => [
          styles.action,
          { backgroundColor: dark ? Brand.lime : Brand.forest },
          (pressed || !ready || busy) && styles.dim,
        ]}
      >
        {busy
          ? <ActivityIndicator color={dark ? Brand.ink : '#FFFFFF'} />
          : <ThemedText style={[styles.actionText, { color: dark ? Brand.ink : '#FFFFFF' }]}>Enter ClassLens  →</ThemedText>}
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  intro: { gap: 12 },
  title: { fontFamily: Fonts.serif, fontWeight: '400', letterSpacing: -1.2 },
  field: { gap: 7 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  input: {
    minHeight: 54, borderRadius: 17, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, lineHeight: 23, borderWidth: 1,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 16,
    borderRadius: 14, borderWidth: 1,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  error: { fontSize: 14, lineHeight: 21 },
  action: { minHeight: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontWeight: '700' },
  dim: { opacity: 0.6 },
});
