import { useMemo, useState } from 'react';

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { createCourse } from '@/services/courses';
import type { Course } from '@/types';

/** Suggestions only: picking one fills the form, it never creates a course. */
const suggestions: { code: string; name: string }[] = [
  { code: 'CS 3358', name: 'Data Structures & Algorithms' },
  { code: 'CS 2325', name: 'Computer Organization' },
  { code: 'MATH 3398', name: 'Discrete Mathematics II' },
  { code: 'MATH 3305', name: 'Introduction to Probability and Statistics' },
  { code: 'ENG 1310', name: 'College Writing I' },
  { code: 'ENG 1320', name: 'College Writing II' },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

type Field = 'code' | 'name';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: (course: Course) => void;
};

export function AddCourseSheet({
  visible,
  onClose,
  onCreated,
}: Props) {
  const theme = useTheme();
  const dark = theme.background !== Brand.paper;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [professor, setProfessor] = useState('');
  const [focused, setFocused] = useState<Field | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ready = code.trim().length > 0 && name.trim().length > 0;

  // Suggest only while typing in the field being matched, and stop once the
  // pair already matches a suggestion exactly.
  const matches = useMemo(() => {
    if (!focused) return [];
    const query = normalize(focused === 'code' ? code : name);
    if (!query) return [];
    const exact = suggestions.some(
      (option) =>
        normalize(option.code) === normalize(code) &&
        normalize(option.name) === normalize(name)
    );
    if (exact) return [];
    // Match the field being typed against its own attribute: matching a code
    // against names surfaces nonsense (“CS” hits “statisti-cs”).
    return suggestions
      .filter((option) =>
        normalize(focused === 'code' ? option.code : option.name).includes(query)
      )
      .slice(0, 4);
  }, [focused, code, name]);

  function reset() {
    setCode('');
    setName('');
    setProfessor('');
    setFocused(null);
    setSaving(false);
    setError('');
  }

  function close() {
    if (saving) return;
    reset();
    onClose();
  }

  async function submit() {
    // The saving guard is what prevents a double submission creating twice.
    if (!ready || saving) return;
    setSaving(true);
    setError('');

    try {
      const course = await createCourse({
        code: code.trim(),
        name: name.trim(),
        professor: professor.trim(),
      });

      onCreated(course);
      reset();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'That course could not be saved. Please try again.'
      );
      setSaving(false);
    }
  }

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      backgroundColor: theme.backgroundElement,
      borderColor: theme.backgroundSelected,
    },
  ];

  function SuggestionList({ field }: { field: Field }) {
    if (focused !== field || matches.length === 0) return null;

    return (
      <View
        style={[
          styles.suggestions,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.backgroundSelected,
          },
        ]}
      >
        {matches.map((option, index) => (
          <Pressable
            key={option.code}
            accessibilityRole="button"
            accessibilityLabel={`Use ${option.code}, ${option.name}`}
            disabled={saving}
            onPress={() => {
              setCode(option.code);
              setName(option.name);
              setFocused(null);
              setError('');
            }}
            style={({ pressed }) => [
              styles.suggestion,
              index > 0 && {
                borderTopWidth: 1,
                borderTopColor: theme.backgroundSelected,
              },
              pressed && {
                backgroundColor: theme.backgroundSelected,
              },
            ]}
          >
            <ThemedText style={styles.suggestionCode}>
              {option.code}
            </ThemedText>

            <ThemedText
              type="small"
              themeColor="textSecondary"
              numberOfLines={1}
            >
              {option.name}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={close}
    >
      <Pressable
        style={styles.backdrop}
        onPress={close}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: theme.background },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View
              style={[
                styles.handle,
                { backgroundColor: theme.backgroundSelected },
              ]}
            />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              <ThemedText
                themeColor="textSecondary"
                style={styles.eyebrow}
              >
                CLASSLENS COURSES
              </ThemedText>

              <ThemedText style={[styles.title, { color: theme.text }]}>
                Add a course.
              </ThemedText>

              <ThemedText
                themeColor="textSecondary"
                style={styles.description}
              >
                Everything you capture for this class will live here.
                Start typing and ClassLens will suggest matching courses.
              </ThemedText>

              <View style={styles.field}>
                <ThemedText
                  themeColor="textSecondary"
                  style={styles.label}
                >
                  COURSE CODE
                </ThemedText>

                <TextInput
                  value={code}
                  onChangeText={setCode}
                  onFocus={() => setFocused('code')}
                  editable={!saving}
                  placeholder="CS 3358"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel="Course code, required"
                  style={inputStyle}
                />

                <SuggestionList field="code" />
              </View>

              <View style={styles.field}>
                <ThemedText
                  themeColor="textSecondary"
                  style={styles.label}
                >
                  COURSE NAME
                </ThemedText>

                <TextInput
                  value={name}
                  onChangeText={setName}
                  onFocus={() => setFocused('name')}
                  editable={!saving}
                  placeholder="Data Structures & Algorithms"
                  placeholderTextColor={theme.textSecondary}
                  accessibilityLabel="Course name, required"
                  style={inputStyle}
                />

                <SuggestionList field="name" />
              </View>

              <View style={styles.field}>
                <ThemedText
                  themeColor="textSecondary"
                  style={styles.label}
                >
                  PROFESSOR (OPTIONAL)
                </ThemedText>

                <TextInput
                  value={professor}
                  onChangeText={setProfessor}
                  onFocus={() => setFocused(null)}
                  editable={!saving}
                  placeholder="Professor Seaman"
                  placeholderTextColor={theme.textSecondary}
                  accessibilityLabel="Professor, optional"
                  style={inputStyle}
                />
              </View>

              {error ? (
                <ThemedText
                  accessibilityLiveRegion="polite"
                  style={[
                    styles.error,
                    { color: dark ? '#E7A6A6' : '#8C3B3B' },
                  ]}
                >
                  {error}
                </ThemedText>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add course"
                accessibilityState={{ disabled: !ready || saving, busy: saving }}
                disabled={!ready || saving}
                onPress={submit}
                style={({ pressed }) => [
                  styles.action,
                  { backgroundColor: dark ? Brand.lime : Brand.forest },
                  (pressed || !ready || saving) && styles.dim,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={dark ? Brand.ink : '#FFFFFF'} />
                ) : (
                  <ThemedText
                    style={[
                      styles.actionText,
                      { color: dark ? Brand.ink : '#FFFFFF' },
                    ]}
                  >
                    Add course
                  </ThemedText>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                accessibilityState={{ disabled: saving }}
                disabled={saving}
                onPress={close}
                style={({ pressed }) => [
                  styles.action,
                  { backgroundColor: theme.backgroundSelected },
                  pressed && styles.dim,
                ]}
              >
                <ThemedText
                  style={[styles.actionText, { color: theme.text }]}
                >
                  Cancel
                </ThemedText>
              </Pressable>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(9,23,17,0.66)',
  },

  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },

  content: {
    gap: 16,
    paddingBottom: 12,
  },

  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 16,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  title: {
    fontFamily: Fonts.serif,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -1,
  },

  description: {
    fontSize: 14,
    lineHeight: 21,
  },

  field: {
    gap: 7,
  },

  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  input: {
    minHeight: 54,
    borderRadius: 17,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    lineHeight: 23,
    borderWidth: 1,
  },

  suggestions: {
    borderRadius: 17,
    borderWidth: 1,
    overflow: 'hidden',
  },

  suggestion: {
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 2,
  },

  suggestionCode: {
    fontSize: 15,
    fontWeight: '700',
  },

  error: {
    fontSize: 14,
    lineHeight: 21,
  },

  action: {
    minHeight: 54,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionText: {
    fontWeight: '700',
  },

  dim: {
    opacity: 0.6,
  },
});
