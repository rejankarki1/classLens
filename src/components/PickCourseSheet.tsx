import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/theme';

import { getCourses } from '@/services/courses';
import type { Course } from '@/types';

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

type Props = {
  visible: boolean;
  /** Preselected when the shared lecture's own course is already yours. */
  initialCourseId?: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (course: Course) => void;
};

export function PickCourseSheet({
  visible,
  initialCourseId,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [courses, setCourses] = useState<Course[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    setError('');
    getCourses()
      .then((data) => {
        if (!active) return;
        setCourses(data);
        setSelected(
          data.some((course) => course.id === initialCourseId)
            ? initialCourseId ?? null
            : data[0]?.id ?? null,
        );
      })
      .catch((caught) => { if (active) setError(message(caught)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [visible, initialCourseId]);

  const chosen = courses.find((course) => course.id === selected) ?? null;

  // An absolute cap: a percentage would resolve against a content-sized parent.
  const sheetMax = Math.round(height * 0.75);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={busy ? () => {} : onClose}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={StyleSheet.absoluteFill}
          onPress={busy ? undefined : onClose}
        />

        <View
          style={[
            styles.sheet,
            { maxHeight: sheetMax, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <ThemedText style={styles.title}>Add to my notes</ThemedText>
              <ThemedText style={styles.subtitle}>
                Choose where you want to save this lecture.
              </ThemedText>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              disabled={busy}
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.dim]}
            >
              <ThemedText allowFontScaling={false} style={styles.closeText}>×</ThemedText>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={Brand.forest} accessibilityLabel="Loading your courses" />
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
            >
              {courses.length === 0 ? (
                <ThemedText style={styles.subtitle}>
                  You don&apos;t have any courses yet. Add one from Courses first.
                </ThemedText>
              ) : null}

              {courses.map((course) => {
                const active = course.id === selected;
                return (
                  <Pressable
                    key={course.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${course.code}, ${course.name}`}
                    accessibilityState={{ selected: active, disabled: busy }}
                    disabled={busy}
                    onPress={() => setSelected(course.id)}
                    style={({ pressed }) => [
                      styles.row,
                      active && styles.rowActive,
                      pressed && styles.dim,
                    ]}
                  >
                    <View style={[styles.badge, active && styles.badgeActive]}>
                      <ThemedText
                        allowFontScaling={false}
                        style={[styles.badgeText, active && styles.badgeTextActive]}
                      >
                        {course.code.split(/\s+/)[0]}
                      </ThemedText>
                    </View>

                    <View style={styles.rowCopy}>
                      <ThemedText style={styles.rowCode}>{course.code}</ThemedText>
                      <ThemedText style={styles.rowName} numberOfLines={1}>
                        {course.name}
                      </ThemedText>
                    </View>

                    <View style={[styles.tick, active && styles.tickActive]}>
                      {active ? (
                        <ThemedText allowFontScaling={false} style={styles.tickText}>✓</ThemedText>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}

              {error ? (
                <ThemedText accessibilityLiveRegion="polite" style={styles.error}>
                  {error}
                </ThemedText>
              ) : null}
            </ScrollView>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={chosen ? `Add to ${chosen.code}` : 'Add to my notes'}
            accessibilityState={{ disabled: !chosen || busy, busy }}
            disabled={!chosen || busy}
            onPress={() => { if (chosen) onConfirm(chosen); }}
            style={({ pressed }) => [
              styles.primary,
              (pressed || !chosen || busy) && styles.dim,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.primaryText}>
                {chosen ? `Add to ${chosen.code}` : 'Add to my notes'}
              </ThemedText>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            disabled={busy}
            onPress={onClose}
            style={({ pressed }) => [styles.cancel, pressed && styles.dim]}
          >
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Mirrors the Catch Up sheet: same cream surface, radii, handle and spacing.
const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(9,23,17,0.66)' },

  sheet: {
    width: '100%',
    backgroundColor: '#F7FAF4',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 9,
    gap: 14,
  },

  handle: {
    width: 38, height: 4, borderRadius: 999,
    backgroundColor: '#C1C9BF', alignSelf: 'center',
  },

  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerCopy: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: Brand.ink, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  subtitle: { color: '#5D685F', fontSize: 14, lineHeight: 21 },

  close: {
    width: 32, height: 32, flexShrink: 0, borderRadius: 16,
    backgroundColor: '#EBEFEB', alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: '#566158', fontSize: 19, lineHeight: 23 },

  list: { flexShrink: 1 },
  listContent: { gap: 10, paddingBottom: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 18, padding: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E1E6DF',
  },
  rowActive: { borderColor: Brand.forest, backgroundColor: '#EEF3EC' },

  badge: {
    width: 44, height: 44, flexShrink: 0, borderRadius: 15,
    backgroundColor: '#EDF3EC', alignItems: 'center', justifyContent: 'center',
  },
  badgeActive: { backgroundColor: Brand.forest },
  badgeText: { color: Brand.forest, fontSize: 12, fontWeight: '800' },
  badgeTextActive: { color: '#FFFFFF' },

  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowCode: { color: Brand.ink, fontSize: 15, fontWeight: '700' },
  rowName: { color: '#5D685F', fontSize: 13, lineHeight: 19 },

  tick: {
    width: 24, height: 24, flexShrink: 0, borderRadius: 12,
    borderWidth: 1, borderColor: '#E1E6DF',
    alignItems: 'center', justifyContent: 'center',
  },
  tickActive: { backgroundColor: Brand.forest, borderColor: Brand.forest },
  tickText: { color: '#FFFFFF', fontSize: 13, lineHeight: 16 },

  primary: {
    minHeight: 54, borderRadius: 17, backgroundColor: Brand.forest,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },

  cancel: {
    minHeight: 48, borderRadius: 17, backgroundColor: '#E8EDE7',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { color: Brand.ink, fontWeight: '700' },

  centered: { paddingVertical: 28, alignItems: 'center' },
  error: { color: '#8C3B3B', fontSize: 14, lineHeight: 21 },
  dim: { opacity: 0.6 },
});
