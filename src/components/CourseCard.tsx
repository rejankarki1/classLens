import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { StatusBadge, formatDate } from '@/components/ui/Editorial';
import { ThemedText } from '@/components/themed-text';
import type { Course } from '@/types';

type Props = {
  course: Course;
  /** Omitted while stats are still loading; the line is hidden until known. */
  lectureCount?: number;
  lastUpdated?: string | null;
};

export function CourseCard({ course, lectureCount, lastUpdated }: Props) {
  const professor = course.professor.trim();
  const showProfessor = professor.length > 0 && professor.toLowerCase() !== 'unknown';
  const showStats = lectureCount !== undefined;
  return <Link href={{ pathname: '/course/[id]', params: { id: course.id } }} asChild>
    <Pressable accessibilityRole="link" accessibilityLabel={`${course.code}, ${course.name}`} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
      <AppCard>
        <View style={styles.row}><StatusBadge label={course.code} /><ThemedText themeColor="textSecondary">↗</ThemedText></View>
        <ThemedText style={styles.title}>{course.name}</ThemedText>
        {showProfessor ? <ThemedText type="small" themeColor="textSecondary">{professor}</ThemedText> : null}
        {showStats ? (
          <ThemedText type="small" themeColor="textSecondary">
            {lectureCount} lecture{lectureCount === 1 ? '' : 's'}
            {lastUpdated ? ` · Updated ${formatDate(lastUpdated)}` : ''}
          </ThemedText>
        ) : null}
        <ThemedText type="smallBold">Open notebook  →</ThemedText>
      </AppCard>
    </Pressable>
  </Link>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 }, title: { fontSize: 26, lineHeight: 32, fontWeight: '500', letterSpacing: -0.5 } });
