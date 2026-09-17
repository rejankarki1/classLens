import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/Screen';
import { Brand, Fonts } from '@/constants/theme';

import { parseCaptureSession } from '@/features/capture/captureSession';
import { matchCourse } from '@/features/courses/matchCourse';
import { analyzeMaterial } from '@/services/ai';
import { createCourse } from '@/services/courses';
import { enrollInCourse, getMyEnrolledCourses } from '@/services/enrollment';
import { createLecture } from '@/services/lectures';
import { attachMaterialToLecture, getMaterials, uploadMaterial } from '@/services/materials';
import type { Course, LectureAnalysis, Material } from '@/types';

type Stage = 'uploading' | 'analyzing' | 'organizing' | 'saving' | 'done';

const stageCopy: Record<Stage, { title: string; body: string }> = {
  uploading: {
    title: 'Uploading your material',
    body: 'Putting your original class material somewhere safe.',
  },
  analyzing: {
    title: 'Reading your lecture',
    body: 'Vision and lecture analysis are working through this exact material.',
  },
  organizing: {
    title: 'Finding where this belongs',
    body: 'Matching this material to the right course.',
  },
  saving: {
    title: 'Building your notebook',
    body: 'Saving the organized lecture so you can come back to it later.',
  },
  done: {
    title: 'Your notebook is ready',
    body: 'Opening the lecture ClassLens just organized.',
  },
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export default function ProcessingScreen() {
  const params = useLocalSearchParams<{
    imageUri?: string | string[];
    imageUris?: string | string[];
    mimeType?: string;
    fileName?: string;
    mode?: string;
    courseId?: string;
    captureSession?: string | string[];
  }>();

  const sessionResult = useMemo(() => {
    const raw = Array.isArray(params.captureSession) ? params.captureSession[0] : params.captureSession;
    if (!raw) return { session: null, error: '' };
    try {
      return { session: parseCaptureSession(raw), error: '' };
    } catch (caught) {
      return {
        session: null,
        error: caught instanceof Error ? caught.message : 'The capture session is invalid.',
      };
    }
  }, [params.captureSession]);

  const assets = useMemo(() => {
    if (sessionResult.session) return sessionResult.session.photos.map((photo) => photo.uri);
    const raw = params.imageUris ?? params.imageUri;

    if (!raw) return [];

    const values = Array.isArray(raw) ? raw : [raw];

    return values
      .flatMap((value) => {
        try {
          const parsed = JSON.parse(value);

          if (Array.isArray(parsed)) {
            return parsed.filter(
              (item): item is string => typeof item === 'string'
            );
          }
        } catch {
          // A normal Expo file URI is expected here.
        }

        return [value];
      })
      .filter(Boolean);
  }, [params.imageUri, params.imageUris, sessionResult.session]);

  const count = assets.length;
  const hasMaterial = count > 0 || Boolean(params.mode);
  const multiPhotoPending = count > 1;
  const invalidCaptureSession = Boolean(params.captureSession && sessionResult.error);

  // The analysis contract takes one photo per material, so the pipeline runs on
  // the first page. Extra pages are previewed but not sent.
  const sessionPhoto = sessionResult.session?.photos[0];
  const source = sessionPhoto?.uri ?? assets[0];
  const mimeType = sessionPhoto?.mimeType ?? (Array.isArray(params.mimeType) ? params.mimeType[0] : params.mimeType);
  const fileName = sessionPhoto?.fileName ?? (Array.isArray(params.fileName) ? params.fileName[0] : params.fileName);
  const courseId = Array.isArray(params.courseId) ? params.courseId[0] : params.courseId;

  const [stage, setStage] = useState<Stage>('uploading');
  const [error, setError] = useState('');
  const [choices, setChoices] = useState<Course[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState({ code: '', name: '', professor: '' });
  const [creating, setCreating] = useState(false);

  // Completed stages are retained so a retry never repeats paid or partial work:
  // no second upload, no second analysis, and no duplicate lecture.
  const material = useRef<Material | null>(null);
  const analysis = useRef<LectureAnalysis | null>(null);
  const savedLectureId = useRef<string | null>(null);
  const course = useRef<Course | null>(null);

  // A re-invoked effect must not start a second upload or a second paid
  // analysis while the first is still awaiting.
  const inFlight = useRef(false);
  const mounted = useRef(true);
  // Prefill the new-course form once, so a retry never discards typed edits.
  const prefilled = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    async function run() {
      if (inFlight.current) return;
      if (multiPhotoPending || invalidCaptureSession) return;
      if (!source) return;
      inFlight.current = true;
      setError('');
      setChoices(null);

      try {
        setStage('uploading');
        if (!material.current) {
          material.current = await uploadMaterial({
            uri: source,
            type: 'photo',
            fileName: fileName ?? 'photo.jpg',
            mimeType: mimeType ?? 'image/jpeg',
          });
        }

        setStage('analyzing');
        if (!analysis.current) analysis.current = await analyzeMaterial(material.current);

        // suggestedCourse is a free-text label, never a course ID, and never creates a course.
        setStage('organizing');
        if (!course.current) {
          const courses = await getMyEnrolledCourses();
          // A course chosen before capture wins over the analysis label.
          if (courseId) course.current = courses.find((candidate) => candidate.id === courseId) ?? null;

          if (!course.current) {
            const matched = matchCourse(analysis.current.suggestedCourse, courses);
            if (!matched) {
              // An empty course list is the normal clean start, not an error:
              // offer creation instead of dead-ending the capture.
              if (!prefilled.current) {
                setForm({
                  code: analysis.current.suggestedCourse ?? '',
                  name: analysis.current.topic,
                  professor: '',
                });
                prefilled.current = true;
              }
              setChoices(courses);
              return;
            }
            course.current = matched;
          }
        }

        setStage('saving');
        if (!savedLectureId.current) {
          const { title, summary, keyConcepts, importantPoints, assignments, examMentions } = analysis.current;
          const lecture = await createLecture({
            courseId: course.current.id,
            title,
            summary,
            keyConcepts,
            importantPoints,
            assignments,
            examMentions,
          });
          savedLectureId.current = lecture.id;
        }

        // Attach only after the lecture exists, and only while still staged.
        if (material.current.lectureId === null) {
          try {
            material.current = await attachMaterialToLecture(material.current.id, savedLectureId.current);
          } catch (error) {
            // A lost response may hide a successful attachment. Never accept another lecture.
            const attached = (await getMaterials(savedLectureId.current)).find(
              (entry) => entry.id === material.current?.id && entry.lectureId === savedLectureId.current
            );
            if (!attached) throw error;
            material.current = attached;
          }
        }

        setStage('done');
        // Leaving the screen cancels navigation; the saved lecture is unaffected.
        if (mounted.current) {
          router.replace({ pathname: '/lecture/[id]', params: { id: savedLectureId.current } });
        }
      } catch (caught) {
        setError(message(caught));
      } finally {
        inFlight.current = false;
      }
    }

    void run();
  }, [attempt, source, mimeType, fileName, courseId, multiPhotoPending, invalidCaptureSession]);

  function retry() {
    router.replace('/capture');
  }

  function tryAgain() {
    setAttempt((value) => value + 1);
  }

  function chooseCourse(selected: Course) {
    course.current = selected;
    tryAgain();
  }

  async function createAndContinue() {
    const code = form.code.trim();
    const name = form.name.trim();
    if (!code || !name || creating) return;
    setCreating(true);
    try {
      // Confirmed by the student, never created straight from the analysis.
      course.current = await createCourse({ code, name, professor: form.professor.trim() });
      await enrollInCourse(course.current.id);
      tryAgain();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setCreating(false);
    }
  }

  const picking = choices !== null;
  const status = stageCopy[stage];
  const understanding = !error && !picking && (stage === 'uploading' || stage === 'analyzing' || stage === 'organizing');
  const building = !error && !picking && (stage === 'saving' || stage === 'done');

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.header}>
          <ThemedText type="smallBold" style={styles.eyebrow}>
            CLASSLENS INTELLIGENCE
          </ThemedText>

          <ThemedText type="title" style={styles.title}>
            {invalidCaptureSession
              ? 'This capture session could not be opened.'
              : !hasMaterial
                ? 'No lecture material found.'
                : multiPhotoPending
                  ? `${count} photos are safely handed off.`
              : error
                ? 'This didn’t come together.'
                : picking
                  ? 'Where does this lecture belong?'
                  : 'Your lecture is being understood.'}
          </ThemedText>

          <ThemedText
            themeColor="textSecondary"
            style={styles.subtitle}
          >
            {invalidCaptureSession
              ? sessionResult.error
              : !hasMaterial
                ? 'Choose a photo, slide, recording, or file and try again.'
                : multiPhotoPending
                  ? 'Every local photo reference reached Processing. Multi-photo upload and analysis arrive in Milestone 3, so none of these photos has been uploaded or analyzed yet.'
              : error
                ? 'Your material is safe. Nothing was lost, and you can pick up where this stopped.'
                : picking
                  ? 'ClassLens organized your material. Tell it which course this belongs to and the notebook will be saved.'
                  : 'ClassLens is turning your actual class material into a structured notebook — never a generic sample.'}
          </ThemedText>
        </View>

        {assets.length > 0 ? (
          <View style={styles.previewSection}>
            <View style={styles.previewHeader}>
              <ThemedText type="smallBold">
                {count === 1
                  ? 'LECTURE PAGE'
                  : `${count} LECTURE PAGES`}
              </ThemedText>

              <View style={styles.readyBadge}>
                <View style={styles.readyDot} />
                <ThemedText style={styles.readyText}>
                  Ready
                </ThemedText>
              </View>
            </View>

            <View style={styles.previewRow}>
              {assets.slice(0, 3).map((uri, index) => (
                <View
                  key={`${uri}-${index}`}
                  style={styles.previewCard}
                >
                  <Image
                    source={{ uri }}
                    style={styles.previewImage}
                    resizeMode="cover"
                  />

                  <View style={styles.pageBadge}>
                    <ThemedText style={styles.pageBadgeText}>
                      {index + 1}
                    </ThemedText>
                  </View>
                </View>
              ))}

              {count > 3 ? (
                <View style={[styles.previewCard, styles.moreCard]}>
                  <ThemedText style={styles.moreNumber}>
                    +{count - 3}
                  </ThemedText>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                  >
                    more
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {hasMaterial && !picking ? (
          <View style={styles.analysisCard}>
            <View style={styles.iconShell}>
              {error || multiPhotoPending ? (
                <ThemedText allowFontScaling={false} style={styles.alert}>
                  {multiPhotoPending ? '✓' : '!'}
                </ThemedText>
              ) : (
                <ActivityIndicator
                  size="small"
                  color={Brand.forest}
                />
              )}
            </View>

            <View style={styles.analysisCopy}>
              <ThemedText type="subtitle">
                {multiPhotoPending ? 'Session preserved' : error ? 'Analysis stopped' : status.title}
              </ThemedText>

              <ThemedText
                themeColor="textSecondary"
                style={styles.body}
                accessibilityLiveRegion="polite"
              >
                {multiPhotoPending
                  ? 'Return to the camera to review or change this session. Processing will support the full set when the Milestone 3 pipeline is implemented.'
                  : error || status.body}
              </ThemedText>
            </View>
          </View>
        ) : null}

        {picking ? (
          <View style={styles.pickerSection}>
            <View style={styles.analysisCard}>
              <View style={styles.analysisCopy}>
                <ThemedText type="subtitle">
                  {analysis.current?.title ?? 'New course'}
                </ThemedText>

                <ThemedText
                  themeColor="textSecondary"
                  style={styles.body}
                >
                  {analysis.current?.suggestedCourse
                    ? `We read this as “${analysis.current.suggestedCourse}”, which doesn’t match a course yet.`
                    : 'We couldn’t tell which course this belongs to.'}
                </ThemedText>

                <View style={styles.field}>
                  <ThemedText type="smallBold" style={styles.fieldLabel}>
                    COURSE CODE
                  </ThemedText>
                  <TextInput
                    value={form.code}
                    onChangeText={(code) => setForm((current) => ({ ...current, code }))}
                    editable={!creating}
                    placeholder="CHEM 1301"
                    placeholderTextColor="#8C968D"
                    accessibilityLabel="Course code"
                    style={styles.input}
                  />
                </View>

                <View style={styles.field}>
                  <ThemedText type="smallBold" style={styles.fieldLabel}>
                    COURSE NAME
                  </ThemedText>
                  <TextInput
                    value={form.name}
                    onChangeText={(name) => setForm((current) => ({ ...current, name }))}
                    editable={!creating}
                    placeholder="Acid-Base Titration"
                    placeholderTextColor="#8C968D"
                    accessibilityLabel="Course name"
                    style={styles.input}
                  />
                </View>

                <View style={styles.field}>
                  <ThemedText type="smallBold" style={styles.fieldLabel}>
                    PROFESSOR (OPTIONAL)
                  </ThemedText>
                  <TextInput
                    value={form.professor}
                    onChangeText={(professor) => setForm((current) => ({ ...current, professor }))}
                    editable={!creating}
                    placeholder="Add it later if you like"
                    placeholderTextColor="#8C968D"
                    accessibilityLabel="Professor, optional"
                    style={styles.input}
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: creating || !form.code.trim() || !form.name.trim() }}
                  disabled={creating || !form.code.trim() || !form.name.trim()}
                  onPress={createAndContinue}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    (pressed || creating || !form.code.trim() || !form.name.trim()) && styles.pressed,
                  ]}
                >
                  <ThemedText style={styles.primaryButtonText}>
                    {creating ? 'Saving…' : 'Create course and save lecture'}
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            {choices.length ? (
              <View style={styles.actions}>
                <ThemedText
                  type="smallBold"
                  themeColor="textSecondary"
                  style={styles.orLabel}
                >
                  OR FILE IT UNDER AN EXISTING COURSE
                </ThemedText>

                {choices.map((option) => (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: creating }}
                    disabled={creating}
                    onPress={() => chooseCourse(option)}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <ThemedText style={styles.secondaryButtonText}>
                      {option.code} · {option.name}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {!multiPhotoPending && !invalidCaptureSession ? <View style={styles.promiseCard}>
          <ThemedText type="smallBold" style={styles.promiseLabel}>
            CLASSLENS PROMISE
          </ThemedText>

          <ThemedText style={styles.promiseTitle}>
            Your notes should come from your lecture.
          </ThemedText>

          <ThemedText
            themeColor="textSecondary"
            style={styles.body}
          >
            ClassLens will not substitute Binary Search Trees,
            sample notes, or unrelated academic content when analysis
            is unavailable.
          </ThemedText>
        </View> : null}

        {!multiPhotoPending && !invalidCaptureSession ? <View style={styles.steps}>
          <Step
            number="01"
            title="Capture"
            description="Your original class material"
            active={hasMaterial}
          />
          <Step
            number="02"
            title="Understand"
            description="Vision + lecture analysis"
            active={understanding || picking}
          />
          <Step
            number="03"
            title="Notebook"
            description="Notes, slides, quiz and Q&A"
            active={building}
          />
        </View> : null}

        <View style={styles.actions}>
          {multiPhotoPending ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <ThemedText style={styles.primaryButtonText}>Review captured photos</ThemedText>
            </Pressable>
          ) : null}

          {error ? (
            <Pressable
              accessibilityRole="button"
              onPress={tryAgain}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText style={styles.primaryButtonText}>
                Try again
              </ThemedText>
            </Pressable>
          ) : null}

          {!multiPhotoPending ? <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={({ pressed }) => [
              error ? styles.secondaryButton : styles.primaryButton,
              pressed && styles.pressed,
            ]}
          >
            <ThemedText style={error ? styles.secondaryButtonText : styles.primaryButtonText}>
              {hasMaterial
                ? 'Choose different material'
                : 'Return to capture'}
            </ThemedText>
          </Pressable> : null}

          {!multiPhotoPending ? <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
          >
            <ThemedText style={styles.secondaryButtonText}>
              Go back
            </ThemedText>
          </Pressable> : null}
        </View>

        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.footer}
        >
          Actual material in. Actual understanding out. ✦
        </ThemedText>
      </View>
    </Screen>
  );
}

function Step({
  number,
  title,
  description,
  active = false,
}: {
  number: string;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <View style={styles.step}>
      <View
        style={[
          styles.stepNumber,
          active && styles.stepNumberActive,
        ]}
      >
        <ThemedText
          style={[
            styles.stepNumberText,
            active && styles.stepNumberTextActive,
          ]}
        >
          {number}
        </ThemedText>
      </View>

      <View style={styles.stepCopy}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText
          type="small"
          themeColor="textSecondary"
        >
          {description}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    gap: 24,
    paddingBottom: 28,
  },

  header: {
    width: '100%',
    gap: 12,
  },

  eyebrow: {
    color: Brand.forest,
    fontSize: 11,
    letterSpacing: 1.5,
  },

  title: {
    fontFamily: Fonts.serif,
    fontWeight: '400',
    letterSpacing: -1.2,
    lineHeight: 46,
  },

  subtitle: {
    maxWidth: 520,
    fontSize: 15,
    lineHeight: 23,
  },

  previewSection: {
    gap: 12,
  },

  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EAF2E8',
  },

  readyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Brand.forest,
  },

  readyText: {
    color: Brand.forest,
    fontSize: 11,
    fontWeight: '700',
  },

  previewRow: {
    flexDirection: 'row',
    gap: 10,
  },

  previewCard: {
    flex: 1,
    minWidth: 0,
    height: 150,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#E9EDE7',
    borderWidth: 1,
    borderColor: '#DDE3DC',
  },

  previewImage: {
    width: '100%',
    height: '100%',
  },

  pageBadge: {
    position: 'absolute',
    left: 9,
    bottom: 9,
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: 'rgba(24, 49, 37, 0.88)',
  },

  pageBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  moreCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },

  moreNumber: {
    color: Brand.forest,
    fontSize: 22,
    fontWeight: '700',
  },

  analysisCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#F2F5EF',
    borderWidth: 1,
    borderColor: '#DDE5DA',
  },

  iconShell: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },

  alert: {
    color: Brand.forest,
    fontSize: 20,
    fontWeight: '700',
  },

  analysisCopy: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },

  body: {
    fontSize: 14,
    lineHeight: 22,
  },

  pickerSection: {
    gap: 12,
  },

  field: {
    gap: 6,
    paddingTop: 4,
  },

  fieldLabel: {
    color: '#5F6A61',
    fontSize: 10,
    letterSpacing: 1.2,
  },

  input: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    color: Brand.ink,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE5DA',
  },

  orLabel: {
    paddingTop: 4,
    fontSize: 10,
    letterSpacing: 1.2,
  },

  promiseCard: {
    gap: 8,
    padding: 20,
    borderRadius: 22,
    backgroundColor: Brand.forest,
  },

  promiseLabel: {
    color: '#C4A66A',
    fontSize: 10,
    letterSpacing: 1.4,
  },

  promiseTitle: {
    color: '#FFFFFF',
    fontFamily: Fonts.serif,
    fontSize: 23,
    lineHeight: 30,
  },

  steps: {
    gap: 10,
  },

  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 5,
  },

  stepNumber: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#EEF0EC',
  },

  stepNumberActive: {
    backgroundColor: Brand.forest,
  },

  stepNumberText: {
    color: '#778078',
    fontSize: 10,
    fontWeight: '700',
  },

  stepNumberTextActive: {
    color: '#FFFFFF',
  },

  stepCopy: {
    flex: 1,
    gap: 2,
  },

  actions: {
    gap: 10,
  },

  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 17,
    backgroundColor: Brand.forest,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  secondaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#D8DED7',
  },

  secondaryButtonText: {
    color: Brand.forest,
    fontWeight: '600',
  },

  pressed: {
    opacity: 0.75,
  },

  footer: {
    textAlign: 'center',
    paddingTop: 4,
  },
});
