import { Pressable, StyleSheet, Text } from 'react-native';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}

export function AppButton({ title, onPress, disabled = false, secondary = false }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled) && styles.dim]}>
      <Text style={styles.label}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: '#2357C6', padding: 16, borderRadius: 14, minHeight: 52, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: '#475569' },
  dim: { opacity: 0.6 },
  label: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
