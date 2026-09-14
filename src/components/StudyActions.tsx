import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Brand } from '@/constants/theme';
import { ThemedText } from './themed-text';
import { AppButton } from './ui/AppButton';

export function StudyActions() {
  const [notice, setNotice] = useState('');
  return <View style={styles.panel}>
    <ThemedText style={styles.label}>✦  GO FROM KNOWING TO UNDERSTANDING</ThemedText>
    <ThemedText style={styles.title}>Make it click.</ThemedText>
    <ThemedText style={styles.body}>Ask the question you didn’t get to ask. Put your understanding to the test.</ThemedText>
    <AppButton title="Ask This Lecture  ↗" secondary onPress={() => setNotice('Coming soon: you’ll be able to ask questions grounded in this lecture. This preview does not send a question.')} />
    <AppButton title="Generate Quiz  →" secondary onPress={() => setNotice('Coming soon: practice with questions from this lecture. No quiz is generated in this preview.')} />
    <ThemedText style={styles.caption}>Study tools preview · Coming soon</ThemedText>
    {notice ? <ThemedText accessibilityLiveRegion="polite" style={styles.body}>{notice}</ThemedText> : null}
  </View>;
}
const styles = StyleSheet.create({ panel: { borderRadius: 24, padding: 24, backgroundColor: Brand.forest, gap: 16 }, label: { color: Brand.lime, fontSize: 10, lineHeight: 16, letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 32, lineHeight: 40, fontWeight: '500' }, body: { color: '#DCE7DA', fontWeight: '400' }, caption: { color: '#DCE7DA', fontSize: 12, lineHeight: 16 } });
