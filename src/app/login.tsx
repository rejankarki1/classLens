import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ClassLensLogo } from '@/components/ClassLensLogo';
import { ThemedText } from '@/components/themed-text';
import { PasswordField } from '@/components/ui/PasswordField';
import { Screen } from '@/components/ui/Screen';
import { Brand, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signIn } from '@/services/auth';

export default function LoginScreen() {
  const theme = useTheme();
  const dark = theme.background !== Brand.paper;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = email.trim().length > 0 && password.length > 0;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
      // The root layout redirects once the session lands.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in.');
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
          Welcome back.
        </ThemedText>

        <ThemedText themeColor="textSecondary">
          Sign in to reach your notebooks, courses and classmates.
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
          autoComplete="email"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          accessibilityLabel="Email"
          style={input}
        />
      </View>

      <View style={styles.field}>
        <ThemedText themeColor="textSecondary" style={styles.label}>PASSWORD</ThemedText>
        <PasswordField
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          editable={!busy}
          placeholder="Your password"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          submitBehavior="submit"
          onSubmitEditing={submit}
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
        accessibilityLabel="Sign in"
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
          : <ThemedText style={[styles.actionText, { color: dark ? Brand.ink : '#FFFFFF' }]}>Sign in</ThemedText>}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create an account"
        disabled={busy}
        onPress={() => router.replace('/signup')}
        style={({ pressed }) => [
          styles.action,
          { backgroundColor: theme.backgroundSelected },
          pressed && styles.dim,
        ]}
      >
        <ThemedText style={[styles.actionText, { color: theme.text }]}>
          Create an account
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
