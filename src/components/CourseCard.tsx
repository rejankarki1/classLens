import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { StatusBadge } from '@/components/ui/Editorial';
import { ThemedText } from '@/components/themed-text';
import type { Course } from '@/types';

export function CourseCard({ course }: { course: Course }) {
  return <Link href={{ pathname: '/course/[id]', params: { id: course.id } }} asChild>
    <Pressable accessibilityRole="link" accessibilityLabel={`${course.code}, ${course.name}`} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
      <AppCard>
        <View style={styles.row}><StatusBadge label={course.code} /><ThemedText themeColor="textSecondary">↗</ThemedText></View>
        <ThemedText style={styles.title}>{course.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{course.professor}</ThemedText>
        <ThemedText type="smallBold">Open notebook  →</ThemedText>
      </AppCard>
    </Pressable>
  </Link>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 }, title: { fontSize: 26, lineHeight: 32, fontWeight: '500', letterSpacing: -0.5 } });
