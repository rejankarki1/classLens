import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { ThemedText } from '@/components/themed-text';
import type { Lecture } from '@/types';

export function LectureCard({ lecture }: { lecture: Lecture }) {
  return (
    <Link href={{ pathname: '/lecture/[id]', params: { id: lecture.id } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={lecture.title}>
        <AppCard>
          <ThemedText style={{ fontSize: 20, fontWeight: '600' }}>{lecture.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{new Date(lecture.createdAt).toLocaleDateString()}</ThemedText>
          <ThemedText numberOfLines={2}>{lecture.summary}</ThemedText>
        </AppCard>
      </Pressable>
    </Link>
  );
}
