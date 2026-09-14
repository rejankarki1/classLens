import { StyleSheet, View } from 'react-native';
import type { Lecture } from '@/types';
import { ThemedText } from './themed-text';
import { SectionHeader, StatusBadge } from './ui/Editorial';
import { AppCard } from './ui/AppCard';
import { useTheme } from '@/hooks/use-theme';

function InsightRows({ items, empty, numbered = false }: { items: string[]; empty: string; numbered?: boolean }) {
  const theme = useTheme();
  return items.length ? <View style={styles.list}>{items.map((item, index) => <View key={`${index}-${item}`} style={styles.row}>
    <View style={[styles.marker, { backgroundColor: theme.backgroundSelected }]}><ThemedText type="smallBold">{numbered ? String(index + 1).padStart(2, '0') : '↳'}</ThemedText></View>
    <ThemedText style={styles.rowText}>{item}</ThemedText>
  </View>)}</View> : <ThemedText themeColor="textSecondary">{empty}</ThemedText>;
}

export function LectureSections({ lecture }: { lecture: Lecture }) {
  const theme = useTheme();
  return <>
    <AppCard>
      <SectionHeader title="The big picture" detail="SUMMARY" />
      <ThemedText style={styles.summary}>{lecture.summary || 'A summary hasn’t been added to this lecture yet.'}</ThemedText>
    </AppCard>
    <SectionHeader title="Ideas to take with you" detail="KEY CONCEPTS" />
    {lecture.keyConcepts.length ? <View style={styles.chips}>{lecture.keyConcepts.map((concept, i) => <StatusBadge key={`${i}-${concept}`} label={concept} />)}</View> : <ThemedText themeColor="textSecondary">No key concepts noted yet.</ThemedText>}
    <SectionHeader title="Worth remembering" detail="IMPORTANT POINTS" />
    <InsightRows items={lecture.importantPoints} empty="No important points noted in this lecture." numbered />
    <View style={[styles.callout, { backgroundColor: theme.backgroundElement }]}>
      <SectionHeader title="Your next steps" detail="ASSIGNMENTS" />
      <InsightRows items={lecture.assignments} empty="Nothing assigned in this lecture. A little breathing room." />
    </View>
    <View style={[styles.callout, { backgroundColor: theme.backgroundSelected, borderLeftWidth: 4, borderLeftColor: theme.textSecondary }]}>
      <SectionHeader title="On the exam radar" detail="EXAM MENTIONS" />
      <InsightRows items={lecture.examMentions} empty="No exam mentions recorded. Check your syllabus for confirmed dates." />
    </View>
    <SectionHeader title="Source material" detail="MATERIALS" />
    <View style={[styles.material, { borderColor: theme.backgroundSelected }]}>
      <ThemedText style={styles.document}>▤</ThemedText>
      <View style={styles.rowText}><ThemedText type="smallBold">No attachments available</ThemedText><ThemedText type="small" themeColor="textSecondary">This notebook doesn’t include source files.</ThemedText></View>
    </View>
  </>;
}
const styles = StyleSheet.create({
  summary: { fontSize: 18, lineHeight: 30, fontWeight: '400' },
  list: { gap: 16 }, row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, rowText: { flex: 1 },
  marker: { minWidth: 32, minHeight: 32, padding: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  callout: { padding: 24, borderRadius: 24, gap: 16 },
  material: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  document: { fontSize: 28, lineHeight: 32 },
});
