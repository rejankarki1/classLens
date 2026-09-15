import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ClassLensLogo } from '@/components/ClassLensLogo';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/Screen';
import { Brand, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signUp } from '@/services/auth';

export default function SignupScreen() {
  const theme = useTheme();
  const dark = theme.background !== Brand.paper;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = email.trim().length > 0 && password.length > 0;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await signUp(email, password);
      // The root layout sends a new account straight to onboarding.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create your account.');
      setBusy(false);
    }
  }

  const input = [styles.input, {
    color: theme.text,
    backgroundColor: theme.backgroundElement,
    borderColor: theme.backgroundSelected,
  }];

  return (
    <Screen>
      <View style={styles.header}>
        <ClassLensLogo compact />
      </View>

      <View style={styles.intro}>
        <ThemedText type="title" style={styles.title}>
          Start with ClassLens.
        </ThemedText>

        <ThemedText themeColor="textSecondary">
          Create an account to keep your notebooks and connect with classmates.
        </ThemedText>
      </View>

      <View style={styles.field}>
        <ThemedText themeColor="textSecondary" style={styles.label}>EMAIL</ThemedText>
        <TextInput
          value={email}
          onChangeText={setEmail}
          editable={!busy}
          placeholder="you@university.edu"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          accessibilityLabel="Email"
          style={input}
        />
      </View>

      <View style={styles.field}>
        <ThemedText themeColor="textSecondary" style={styles.label}>PASSWORD</ThemedText>
        <TextInput
          value={password}
          onChangeText={setPassword}
          editable={!busy}
          placeholder="At least 6 characters"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          secureTextEntry
          textContentType="newPassword"
          accessibilityLabel="Password"
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
        accessibilityLabel="Create account"
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
          : <ThemedText style={[styles.actionText, { color: dark ? Brand.ink : '#FFFFFF' }]}>Create account</ThemedText>}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="I already have an account"
        disabled={busy}
        onPress={() => router.replace('/login')}
        style={({ pressed }) => [
          styles.action,
          { backgroundColor: theme.backgroundSelected },
          pressed && styles.dim,
        ]}
      >
        <ThemedText style={[styles.actionText, { color: theme.text }]}>
          I already have an account
        </ThemedText>
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
  error: { fontSize: 14, lineHeight: 21 },
  action: { minHeight: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontWeight: '700' },
  dim: { opacity: 0.6 },
});
