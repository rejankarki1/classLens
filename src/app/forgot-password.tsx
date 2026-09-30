import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ClassLensLogo } from '@/components/ClassLensLogo';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/Screen';
import { Brand, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { requestPasswordRecovery, verifyPasswordRecoveryCode } from '@/services/auth';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const inputStyle = [styles.input, {
    color: theme.text,
    backgroundColor: theme.backgroundElement,
    borderColor: theme.backgroundSelected,
  }];

  async function sendCode() {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      setSentTo(await requestPasswordRecovery(email));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send a recovery email.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!sentTo || !/^\d{6}$/.test(code) || busy) return;
    setBusy(true);
    setError('');
    try {
      await verifyPasswordRecoveryCode(sentTo, code);
      router.replace('/reset-password' as never);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That recovery code could not be verified.');
      setBusy(false);
    }
  }

  return (
    <Screen avoidKeyboard>
      <View style={styles.header}><ClassLensLogo compact /></View>
      <View style={styles.intro}>
        <ThemedText type="title" style={styles.title}>Reset your password.</ThemedText>
        <ThemedText themeColor="textSecondary">
          {sentTo ? `Enter the six-digit code sent to ${sentTo}.` : 'We’ll email you a six-digit recovery code.'}
        </ThemedText>
      </View>

      {!sentTo ? (
        <View style={styles.field}>
          <ThemedText themeColor="textSecondary" style={styles.label}>EMAIL</ThemedText>
          <TextInput
            value={email}
            onChangeText={setEmail}
            editable={!busy}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="send"
            onSubmitEditing={sendCode}
            accessibilityLabel="Email"
            style={inputStyle}
          />
        </View>
      ) : (
        <View style={styles.field}>
          <ThemedText themeColor="textSecondary" style={styles.label}>RECOVERY CODE</ThemedText>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            editable={!busy}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={verifyCode}
            accessibilityLabel="Six-digit recovery code"
            style={inputStyle}
          />
        </View>
      )}

      {error ? <ThemedText accessibilityLiveRegion="polite" style={styles.error}>{error}</ThemedText> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy || (!sentTo ? !email.trim() : code.length !== 6)}
        onPress={sentTo ? verifyCode : sendCode}
        style={({ pressed }) => [styles.action, (pressed || busy) && styles.dim]}
      >
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.actionText}>{sentTo ? 'Verify code' : 'Send code'}</ThemedText>}
      </Pressable>

      {sentTo ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => { setSentTo(null); setCode(''); setError(''); }}
          style={({ pressed }) => [styles.secondary, pressed && styles.dim]}
        >
          <ThemedText style={{ color: theme.text, fontWeight: '700' }}>Use a different email</ThemedText>
        </Pressable>
      ) : null}
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
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.6 },
});
