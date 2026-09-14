import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';

export function AppCard({ children }: PropsWithChildren) {
  return <ThemedView type="backgroundElement" style={styles.card}>{children}</ThemedView>;
}

const styles = StyleSheet.create({ card: { padding: 24, borderRadius: 24, gap: 16, boxShadow: '0 4px 20px rgba(15, 35, 24, 0.04)' } });
