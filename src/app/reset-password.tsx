import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ClassLensLogo } from '@/components/ClassLensLogo';
import { ThemedText } from '@/components/themed-text';
import { PasswordField } from '@/components/ui/PasswordField';
import { Screen } from '@/components/ui/Screen';
import { Brand, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { updateRecoveredPassword } from '@/services/auth';

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const confirmRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = password.length >= 6 && password === confirmation;
  const inputStyle = [styles.input, {
    color: theme.text,
    backgroundColor: theme.backgroundElement,
    borderColor: theme.backgroundSelected,
  }];

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await updateRecoveredPassword(password);
      router.replace('/login');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update your password.');
      setBusy(false);
    }
  }

  return (
    <Screen avoidKeyboard>
      <View style={styles.header}><ClassLensLogo compact /></View>
      <View style={styles.intro}>
        <ThemedText type="title" style={styles.title}>Choose a new password.</ThemedText>
        <ThemedText themeColor="textSecondary">Use at least six characters.</ThemedText>
      </View>

      <View style={styles.field}>
        <ThemedText themeColor="textSecondary" style={styles.label}>NEW PASSWORD</ThemedText>
        <PasswordField
          value={password}
          onChangeText={setPassword}
          editable={!busy}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          accessibilityLabel="New password"
          style={inputStyle}
        />
      </View>
      <View style={styles.field}>
        <ThemedText themeColor="textSecondary" style={styles.label}>CONFIRM PASSWORD</ThemedText>
        <PasswordField
          ref={confirmRef}
          value={confirmation}
          onChangeText={setConfirmation}
          editable={!busy}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={submit}
          accessibilityLabel="Confirm new password"
          style={inputStyle}
        />
      </View>
      {confirmation && password !== confirmation ? <ThemedText style={styles.error}>Passwords do not match.</ThemedText> : null}
      {error ? <ThemedText accessibilityLiveRegion="polite" style={styles.error}>{error}</ThemedText> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || busy, busy }}
        disabled={!ready || busy}
        onPress={submit}
        style={({ pressed }) => [styles.action, (pressed || !ready || busy) && styles.dim]}
      >
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.actionText}>Set new password</ThemedText>}
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row' },
  intro: { gap: 12 },
  title: { fontFamily: Fonts.serif, fontWeight: '400', letterSpacing: -1.2 },
  field: { gap: 7 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  input: { minHeight: 54, borderRadius: 17, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, borderWidth: 1 },
  error: { color: '#8C3B3B', fontSize: 14, lineHeight: 21 },
  action: { minHeight: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.forest },
  actionText: { color: '#FFFFFF', fontWeight: '700' },
  dim: { opacity: 0.6 },
});
