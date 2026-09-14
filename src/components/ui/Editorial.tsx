import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { AppButton } from './AppButton';

export function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return <View style={styles.heading}>
    <ThemedText accessibilityRole="header" style={styles.title}>{title}</ThemedText>
    {detail ? <ThemedText type="small" themeColor="textSecondary">{detail}</ThemedText> : null}
  </View>;
}

export function StatusBadge({ label }: { label: string }) {
  const theme = useTheme();
  return <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
    <ThemedText type="small" style={styles.badgeText}>{label}</ThemedText>
  </View>;
}

export function EmptyState({ title, description, loading, action, onPress }: {
  title: string; description: string; loading?: boolean; action?: string; onPress?: () => void;
}) {
  const theme = useTheme();
  return <View accessibilityState={{ busy: !!loading }} style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
    {loading ? <ActivityIndicator color={theme.text} accessibilityLabel={title} /> : <ThemedText accessible={false} importantForAccessibility="no" style={styles.mark}>⌑</ThemedText>}
    <ThemedText accessibilityRole="header" style={styles.title}>{title}</ThemedText>
    <ThemedText themeColor="textSecondary" style={styles.center}>{description}</ThemedText>
    {action && onPress ? <AppButton title={action} onPress={onPress} /> : null}
  </View>;
}

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600', flexShrink: 1 },
  badge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, alignSelf: 'flex-start', maxWidth: '100%' },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  empty: { padding: 24, borderRadius: 24, gap: 16 },
  mark: { fontSize: 32, lineHeight: 40 },
  center: { lineHeight: 24 },
});
