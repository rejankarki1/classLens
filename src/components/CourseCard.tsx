import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { ThemedText } from '@/components/themed-text';
import type { Course } from '@/types';

export function CourseCard({ course }: { course: Course }) {
  return (
    <Link href={{ pathname: '/course/[id]', params: { id: course.id } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`${course.code}, ${course.name}`}>
        <AppCard>
          <ThemedText type="smallBold">{course.code}</ThemedText>
          <ThemedText style={{ fontSize: 22, lineHeight: 28 }}>{course.name}</ThemedText>
          <ThemedText themeColor="textSecondary">{course.professor}</ThemedText>
        </AppCard>
      </Pressable>
    </Link>
  );
}
