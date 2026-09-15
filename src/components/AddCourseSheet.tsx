import { useState } from 'react';

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

import { createCourse } from '@/services/courses';
import type { Course } from '@/types';

/** Shortcuts only: tapping one prefills the form, it never creates a course. */
const recommended: { code: string; name: string }[] = [
  { code: 'CS 3358', name: 'Data Structures & Algorithms' },
  { code: 'CS 2325', name: 'Computer Organization' },
  { code: 'MATH 3398', name: 'Discrete Mathematics II' },
  { code: 'MATH 3305', name: 'Introduction to Probability and Statistics' },
  { code: 'ENG 1310', name: 'College Writing I' },
  { code: 'ENG 1320', name: 'College Writing II' },
];

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
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [professor, setProfessor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ready = code.trim().length > 0 && name.trim().length > 0;

  function reset() {
    setCode('');
    setName('');
    setProfessor('');
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
            style={styles.sheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.handle} />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              <ThemedText style={styles.eyebrow}>
                CLASSLENS COURSES
              </ThemedText>

              <ThemedText style={styles.title}>
                Add a course.
              </ThemedText>

              <ThemedText
                themeColor="textSecondary"
                style={styles.description}
              >
                Everything you capture for this class will live here.
              </ThemedText>

              <View style={styles.field}>
                <ThemedText style={styles.label}>
                  COURSE CODE
                </ThemedText>

                <TextInput
                  value={code}
                  onChangeText={setCode}
                  editable={!saving}
                  placeholder="CS 3358"
                  placeholderTextColor="#8C968D"
                  autoCapitalize="characters"
                  accessibilityLabel="Course code, required"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <ThemedText style={styles.label}>
                  COURSE NAME
                </ThemedText>

                <TextInput
                  value={name}
                  onChangeText={setName}
                  editable={!saving}
                  placeholder="Data Structures & Algorithms"
                  placeholderTextColor="#8C968D"
                  accessibilityLabel="Course name, required"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <ThemedText style={styles.label}>
                  PROFESSOR (OPTIONAL)
                </ThemedText>

                <TextInput
                  value={professor}
                  onChangeText={setProfessor}
                  editable={!saving}
                  placeholder="Professor Seaman"
                  placeholderTextColor="#8C968D"
                  accessibilityLabel="Professor, optional"
                  style={styles.input}
                />
              </View>

              <View style={styles.recommended}>
                <ThemedText style={styles.label}>
                  RECOMMENDED
                </ThemedText>

                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                >
                  Tap one to fill the form. Nothing is saved until you add it.
                </ThemedText>

                <View style={styles.chips}>
                  {recommended.map((option) => (
                    <Pressable
                      key={option.code}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${option.code}, ${option.name}`}
                      accessibilityState={{ disabled: saving }}
                      disabled={saving}
                      onPress={() => {
                        setCode(option.code);
                        setName(option.name);
                        setError('');
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        pressed && styles.chipPressed,
                      ]}
                    >
                      <ThemedText style={styles.chipCode}>
                        {option.code}
                      </ThemedText>

                      <ThemedText
                        type="small"
                        themeColor="textSecondary"
                        numberOfLines={2}
                      >
                        {option.name}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              {error ? (
                <ThemedText
                  accessibilityLiveRegion="polite"
                  style={styles.error}
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
                  styles.submit,
                  (pressed || !ready || saving) && styles.submitDim,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.submitText}>
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
                  styles.cancel,
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText style={styles.cancelText}>
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
    backgroundColor: '#F7F6F0',
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
    backgroundColor: '#CDD4CD',
    alignSelf: 'center',
    marginBottom: 16,
  },

  eyebrow: {
    color: '#708479',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  title: {
    fontFamily: Fonts.serif,
    color: Brand.ink,
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
    color: '#708479',
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
    color: Brand.ink,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E6DF',
  },

  recommended: {
    gap: 8,
    paddingTop: 4,
  },

  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 4,
  },

  chip: {
    width: '48%',
    minHeight: 76,
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E6DF',
    justifyContent: 'center',
    gap: 4,
  },

  chipPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },

  chipCode: {
    color: Brand.ink,
    fontSize: 15,
    fontWeight: '700',
  },

  error: {
    color: '#8C3B3B',
    fontSize: 14,
    lineHeight: 21,
  },

  submit: {
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: Brand.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },

  submitDim: {
    opacity: 0.55,
  },

  submitText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  cancel: {
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: '#E8EDE7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelText: {
    color: Brand.ink,
    fontWeight: '700',
  },

  pressed: {
    opacity: 0.55,
  },
});
