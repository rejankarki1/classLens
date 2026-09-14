import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { StatusBadge, formatDate } from '@/components/ui/Editorial';
import { ThemedText } from '@/components/themed-text';
import type { Lecture } from '@/types';

export function LectureCard({ lecture }: { lecture: Lecture }) {
  return <Link href={{ pathname: '/lecture/[id]', params: { id: lecture.id } }} asChild>
    <Pressable accessibilityRole="link" accessibilityLabel={`Read ${lecture.title}`} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <AppCard>
        <View style={styles.row}><ThemedText type="small" themeColor="textSecondary">{formatDate(lecture.createdAt)}</ThemedText><ThemedText>↗</ThemedText></View>
        <ThemedText style={styles.title}>{lecture.title}</ThemedText>
        <ThemedText themeColor="textSecondary" numberOfLines={2}>{lecture.summary || 'Open this lecture to explore your notes.'}</ThemedText>
        <View style={styles.tags}>
          <StatusBadge label={`${lecture.keyConcepts.length} concepts`} />
          {lecture.assignments.length > 0 ? <StatusBadge label={`${lecture.assignments.length} assignment${lecture.assignments.length === 1 ? '' : 's'}`} /> : null}
          {lecture.examMentions.length > 0 ? <StatusBadge label="Exam mentioned" /> : null}
        </View>
      </AppCard>
    </Pressable>
  </Link>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, title: { fontSize: 22, lineHeight: 28, fontWeight: '600' }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
