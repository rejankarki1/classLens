import { Pressable, StyleSheet, Text } from 'react-native';
import { Brand, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  accessibilityHint?: string;
}

export function AppButton({ title, onPress, disabled = false, secondary = false, accessibilityHint }: Props) {
  const theme = useTheme();
  const dark = theme.background !== Brand.paper;
  const backgroundColor = secondary ? theme.backgroundSelected : dark ? Brand.lime : Brand.forest;
  const color = secondary ? theme.text : dark ? Brand.ink : '#FFFFFF';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={accessibilityHint} accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor }, (pressed || disabled) && styles.dim]}>
      <Text style={[styles.label, { color }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: Brand.forest, padding: 16, borderRadius: 16, minHeight: 56, justifyContent: 'center', alignItems: 'center' },
  dim: { opacity: 0.6 },
  label: { fontFamily: Fonts.sans, fontSize: 16, lineHeight: 24, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
});
