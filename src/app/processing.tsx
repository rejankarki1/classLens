import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { ProcessingCard } from '@/components/ProcessingCard';
import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { EmptyState, StatusBadge } from '@/components/ui/Editorial';
import { Screen } from '@/components/ui/Screen';
import { matchCourse } from '@/features/courses/matchCourse';
import { analyzeMaterial } from '@/services/ai';
import { getCourses } from '@/services/courses';
import { createLecture } from '@/services/lectures';
import { attachMaterialToLecture, uploadMaterial } from '@/services/materials';
import type { Course, LectureAnalysis, Material } from '@/types';

const steps = ['Uploading', 'Analyzing', 'Organizing', 'Creating lecture'] as const;
const descriptions = [
  'Putting your material somewhere safe.',
  'Reading the ideas on the page.',
  'Finding where this knowledge belongs.',
  'Saving your organized notebook.',
] as const;

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export default function ProcessingScreen() {
  const { imageUri, mimeType, fileName } = useLocalSearchParams<{
    imageUri?: string;
    mimeType?: string;
    fileName?: string;
  }>();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [choices, setChoices] = useState<Course[] | null>(null);
  const [attempt, setAttempt] = useState(0);

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

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    async function run() {
      if (inFlight.current) return;
      if (!imageUri) {
        setError('No photo was provided. Capture or choose a photo and try again.');
        return;
      }
      inFlight.current = true;
      setError('');
      setChoices(null);

      try {
        setStep(0);
        if (!material.current) {
          material.current = await uploadMaterial({
            uri: imageUri,
            type: 'photo',
            fileName: fileName ?? 'photo.jpg',
            mimeType: mimeType ?? 'image/jpeg',
          });
        }

        setStep(1);
        if (!analysis.current) analysis.current = await analyzeMaterial(material.current);

        // suggestedCourse is a free-text label, never a course ID, and never creates a course.
        setStep(2);
        if (!course.current) {
          const courses = await getCourses();
          if (!courses.length) {
            throw new Error('No courses are available yet. Add a course before saving a lecture.');
          }
          const matched = matchCourse(analysis.current.suggestedCourse, courses);
          if (!matched) {
            setChoices(courses);
            return;
          }
          course.current = matched;
        }

        setStep(3);
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
          material.current = await attachMaterialToLecture(material.current.id, savedLectureId.current);
        }

        setStep(steps.length);
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
  }, [attempt, imageUri, mimeType, fileName]);

  function retry() {
    setAttempt((value) => value + 1);
  }

  function chooseCourse(selected: Course) {
    course.current = selected;
    retry();
  }

  const cancel = <AppButton title="Cancel" secondary onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />;

  if (error) {
    return <Screen footer={cancel}>
      <StatusBadge label="02 / UNDERSTAND" />
      <EmptyState
        title="This didn’t come together"
        description={error}
        action="Try again"
        onPress={retry}
      />
    </Screen>;
  }

  if (choices) {
    return <Screen footer={cancel}>
      <StatusBadge label="02 / UNDERSTAND" />
      <ThemedText type="subtitle">Where does this belong?</ThemedText>
      <ThemedText themeColor="textSecondary">
        {analysis.current?.suggestedCourse
          ? `We read this as “${analysis.current.suggestedCourse}”, which doesn’t match a course yet. Pick where it belongs.`
          : 'We couldn’t tell which course this belongs to. Pick where it belongs.'}
      </ThemedText>
      <AppCard>
        <StatusBadge label="CHOOSE A COURSE" />
        {analysis.current ? <ThemedText style={{ fontSize: 24, lineHeight: 32, fontWeight: '500' }}>{analysis.current.title}</ThemedText> : null}
        <View style={{ gap: 12 }}>
          {choices.map((option) => (
            <AppButton
              key={option.id}
              title={`${option.code} · ${option.name}`}
              secondary
              onPress={() => chooseCourse(option)}
            />
          ))}
        </View>
      </AppCard>
    </Screen>;
  }

  return <Screen footer={cancel}>
    <StatusBadge label="02 / UNDERSTAND" />
    <ThemedText type="subtitle">A little order. A lot of possibility.</ThemedText>
    <ThemedText themeColor="textSecondary">
      ClassLens is reading your material and building an organized lecture. This takes a moment.
    </ThemedText>
    <ProcessingCard
      step={step}
      steps={steps}
      descriptions={descriptions}
      caption="LIVE ANALYSIS"
      completeTitle="A clearer picture."
      completeDescription="Opening your saved lecture."
    />
  </Screen>;
}
