import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/Screen';
import { Fonts } from '@/constants/theme';
import { StyleSheet, View } from 'react-native';

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.sectionBody}>{children}</ThemedText>
    </View>
  );
}

export default function PrivacyScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.title}>Privacy & deletion</ThemedText>
        <ThemedText themeColor="textSecondary">
          What ClassLens keeps, what it removes automatically, and what only you can delete.
        </ThemedText>
      </View>

      <Section title="Original photos are removed after 7 days">
        Once a captured lecture is filed, ClassLens automatically deletes the original
        photos from storage 7 days later. This only removes the ability to re-run
        analysis on that image or visually review the original page. It does not delete
        anything else: your notebook's saved text, corrections, summaries, key concepts,
        and citations all stay exactly as they were.
      </Section>

      <Section title="This automatic cleanup never deletes your notes">
        The 7-day sweep is an image-storage cleanup, not a way to remove your notebook.
        Ask This Lecture, quizzes, and your notebook pages keep working normally
        afterward, because they are grounded in the saved text rather than the original
        photo.
      </Section>

      <Section title="Deleting a lecture or your account is a separate, explicit action">
        If you ever want a lecture notebook or your entire account removed, that only
        happens at your explicit request — never automatically, and never as a side
        effect of the 7-day image cleanup above. When it happens, deleting a lecture
        removes its captures, saved analysis, corrections, and quiz history together;
        deleting your account removes everything tied to it the same way.
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 12 },
  title: { fontFamily: Fonts.serif, fontWeight: '400', letterSpacing: -1.2 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  sectionBody: { lineHeight: 22 },
});
