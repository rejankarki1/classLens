import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type Props = Omit<TextInputProps, 'secureTextEntry'> & {
  ref?: Ref<TextInput>;
};

export function PasswordField({ ref, style, editable = true, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  const { backgroundColor, borderColor, borderRadius, borderWidth } = StyleSheet.flatten(style) ?? {};

  return (
    <View style={[styles.container, { backgroundColor, borderColor, borderRadius, borderWidth }]}>
      <TextInput
        {...props}
        ref={ref}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        secureTextEntry={!visible}
        style={[style, styles.input]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        accessibilityState={{ disabled: !editable }}
        disabled={!editable}
        onPress={() => setVisible((current) => !current)}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        <ThemedText style={styles.toggleText}>{visible ? 'Hide' : 'Show'}</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0, paddingVertical: 0 },
  input: { flex: 1, minWidth: 0, borderWidth: 0, backgroundColor: 'transparent' },
  toggle: { minWidth: 64, minHeight: 48, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
