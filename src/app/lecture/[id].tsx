import {
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import {
  router,
  useLocalSearchParams,
} from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/Screen';
import { EmptyState } from '@/components/ui/Editorial';
import { StudyActions } from '@/components/StudyActions';

import { Brand, Colors, Fonts } from '@/constants/theme';

// These notebook cards are painted a fixed cream/white, so text on them must use
// the fixed dark palette. Inheriting theme.text turns them invisible in dark mode.
const onCard = Colors.light.text;
const onCardMuted = Colors.light.textSecondary;

import { getLecture } from '@/services/lectures';
import { getCourse } from '@/services/courses';
import { getMaterialUrl, getMaterials } from '@/services/materials';

import type {
  Course,
  Lecture,
} from '@/types';

export default function LectureNotebookScreen() {
  const { id } = useLocalSearchParams<{
    id: string;
  }>();

  const [lecture, setLecture] =
    useState<Lecture | null>(null);

  const [course, setCourse] =
    useState<Course | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(false);

  const [attempt, setAttempt] =
    useState(0);

  const [originals, setOriginals] =
    useState<string[]>([]);

  useEffect(() => {
    let active = true;

    async function loadLecture() {
      try {
        setLoading(true);
        setError(false);

        const nextLecture =
          await getLecture(id);

        if (!active) {
          return;
        }

        if (!nextLecture) {
          setLecture(null);
          setCourse(null);
          setOriginals([]);
          return;
        }

        setLecture(nextLecture);

        const nextCourse =
          await getCourse(
            nextLecture.courseId
          );

        if (!active) {
          return;
        }

        setCourse(nextCourse);

        // Originals are supporting content: a failure here must not take down
        // the notebook the student came to read.
        try {
          const materials =
            await getMaterials(
              nextLecture.id
            );

          const urls =
            await Promise.all(
              materials.map((material) =>
                getMaterialUrl(material)
              )
            );

          if (!active) {
            return;
          }

          setOriginals(
            urls.filter(
              (url): url is string =>
                typeof url === 'string'
            )
          );
        } catch {
          if (active) {
            setOriginals([]);
          }
        }
      } catch {
        if (active) {
          setError(true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadLecture();

    return () => {
      active = false;
    };
  }, [id, attempt]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.loadingState}>
          <ActivityIndicator
            size="large"
            color={Brand.forest}
          />

          <ThemedText style={styles.loadingTitle}>
            Building your notebook
          </ThemedText>

          <ThemedText
            themeColor="textSecondary"
            style={styles.loadingDescription}
          >
            Organizing the lecture into a study-ready notebook.
          </ThemedText>
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <EmptyState
          title="We couldn't open this notebook"
          description="Something interrupted the lecture load."
          action="Try again"
          onPress={() =>
            setAttempt(
              (value) => value + 1
            )
          }
        />
      </Screen>
    );
  }

  if (!lecture) {
    return (
      <Screen>
        <EmptyState
          title="Notebook not found"
          description="This lecture may no longer be available."
        />
      </Screen>
    );
  }

  const formattedDate =
    formatDate(lecture.createdAt);

  return (
    <Screen>
      {/* TOP APP BAR */}

      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          }}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
        >
          <ThemedText
            allowFontScaling={false}
            style={styles.backIcon}
          >
            ‹
          </ThemedText>
        </Pressable>

        <View style={styles.topIdentity}>
          <View style={styles.topIdentityRow}>
            <View style={styles.courseBadge}>
              <ThemedText
                allowFontScaling={false}
                style={styles.courseBadgeText}
              >
                {course?.code ?? 'LECTURE'}
              </ThemedText>
            </View>

            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.topMetaText}
            >
              Notebook
            </ThemedText>
          </View>

          <ThemedText
            numberOfLines={2}
            style={styles.topCourseTitle}
          >
            {course?.name ?? 'ClassLens'}
          </ThemedText>
        </View>
      </View>

      {/* NOTEBOOK HERO */}

      <View style={styles.hero}>
        <View style={styles.statusRow}>
          <View style={styles.readyBadge}>
            <View style={styles.readyDot} />

            <ThemedText
              allowFontScaling={false}
              style={styles.readyText}
            >
              AI NOTEBOOK READY
            </ThemedText>
          </View>

          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.dateText}
          >
            {formattedDate}
          </ThemedText>
        </View>

        <ThemedText
          type="title"
          style={styles.lectureTitle}
        >
          {lecture.title}
        </ThemedText>

        <View style={styles.metadataRow}>
          {course?.professor ? (
            <MetaPill
              label={course.professor}
            />
          ) : null}

          <MetaPill
            label={formattedDate}
          />
        </View>

        <ThemedText
          themeColor="textSecondary"
          style={styles.heroDescription}
        >
          Your lecture has been organized into the ideas,
          concepts, signals, and study actions that matter most.
        </ThemedText>
      </View>

      <View style={styles.rule} />

      {/* NOTEBOOK OVERVIEW */}

      <NotebookSection
        number="01"
        eyebrow="QUICK UNDERSTANDING"
        title="What this lecture is about"
      >
        <View style={styles.summaryBlock}>
          <View style={styles.summaryAccent} />

          <ThemedText style={styles.summaryText}>
            {lecture.summary ||
              'ClassLens organized this lecture into the main learning ideas below.'}
          </ThemedText>
        </View>
      </NotebookSection>

      {/* TAKEAWAYS */}

      {lecture.importantPoints.length > 0 ? (
        <NotebookSection
          number="02"
          eyebrow="CORE LEARNING"
          title="Executive takeaways"
        >
          <View style={styles.takeawayList}>
            {lecture.importantPoints.map(
              (point, index) => (
                <View
                  key={`${point}-${index}`}
                  style={styles.takeawayCard}
                >
                  <View style={styles.takeawayIndex}>
                    <ThemedText
                      allowFontScaling={false}
                      style={styles.takeawayIndexText}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </ThemedText>
                  </View>

                  <ThemedText style={styles.takeawayText}>
                    {point}
                  </ThemedText>
                </View>
              )
            )}
          </View>
        </NotebookSection>
      ) : null}

      {/* VISUAL DIAGRAM */}

      {lecture.keyConcepts.length > 0 ? (
        <NotebookSection
          number="03"
          eyebrow="VISUAL EXPLANATION"
          title="How the ideas connect"
        >
          <ThemedText
            themeColor="textSecondary"
            style={styles.sectionDescription}
          >
            A simplified learning map generated from the core
            concepts in this lecture.
          </ThemedText>

          <ConceptDiagram
            concepts={lecture.keyConcepts}
          />
        </NotebookSection>
      ) : null}

      {/* KEY CONCEPTS */}

      {lecture.keyConcepts.length > 0 ? (
        <NotebookSection
          number="04"
          eyebrow="KNOW THESE"
          title="Key concepts"
        >
          <View style={styles.conceptGrid}>
            {lecture.keyConcepts.map(
              (concept, index) => (
                <View
                  key={`${concept}-${index}`}
                  style={styles.conceptChip}
                >
                  <View style={styles.conceptMarker} />

                  <ThemedText style={styles.conceptText}>
                    {concept}
                  </ThemedText>
                </View>
              )
            )}
          </View>
        </NotebookSection>
      ) : null}

      {/* FULL NOTEBOOK */}

      <NotebookSection
        number="05"
        eyebrow="COMPLETE NOTES"
        title="Lecture notebook"
      >
        <View style={styles.notebookPaper}>
          <View style={styles.notebookMargin} />

          <ThemedText style={styles.notebookLead}>
            {lecture.summary}
          </ThemedText>

          {lecture.importantPoints.map(
            (point, index) => (
              <View
                key={`notebook-${index}`}
                style={styles.notebookPoint}
              >
                <View style={styles.noteBullet} />

                <ThemedText style={styles.notebookPointText}>
                  {point}
                </ThemedText>
              </View>
            )
          )}
        </View>
      </NotebookSection>

      {/* EXAM */}

      {lecture.examMentions.length > 0 ? (
        <NotebookSection
          number="06"
          eyebrow="EXAM SIGNALS"
          title="What deserves extra attention"
        >
          <View style={styles.examCard}>
            <View style={styles.examHeading}>
              <View style={styles.examIcon}>
                <ThemedText
                  allowFontScaling={false}
                  style={styles.examIconText}
                >
                  !
                </ThemedText>
              </View>

              <View style={styles.examHeadingCopy}>
                <ThemedText style={styles.examTitle}>
                  Exam priority
                </ThemedText>

                <ThemedText
                  type="small"
                  style={styles.onCardMuted}
                >
                  Review these before the next assessment.
                </ThemedText>
              </View>
            </View>

            {lecture.examMentions.map(
              (mention, index) => (
                <View
                  key={`${mention}-${index}`}
                  style={styles.examItem}
                >
                  <View style={styles.examBullet} />

                  <ThemedText style={styles.examText}>
                    {mention}
                  </ThemedText>
                </View>
              )
            )}
          </View>
        </NotebookSection>
      ) : null}

      {/* ASSIGNMENTS */}

      {lecture.assignments.length > 0 ? (
        <NotebookSection
          number="07"
          eyebrow="ACTION ITEMS"
          title="Assignments"
        >
          <View style={styles.assignmentList}>
            {lecture.assignments.map(
              (assignment, index) => (
                <View
                  key={`${assignment}-${index}`}
                  style={styles.assignmentCard}
                >
                  <View style={styles.checkbox} />

                  <View style={styles.assignmentCopy}>
                    <ThemedText
                      style={styles.assignmentNumber}
                    >
                      Assignment {index + 1}
                    </ThemedText>

                    <ThemedText style={styles.assignmentText}>
                      {assignment}
                    </ThemedText>
                  </View>
                </View>
              )
            )}
          </View>
        </NotebookSection>
      ) : null}

      {/* REVIEW */}

      {lecture.keyConcepts.length > 0 ? (
        <NotebookSection
          number="08"
          eyebrow="SELF CHECK"
          title="Questions to review"
        >
          <View style={styles.reviewList}>
            {lecture.keyConcepts
              .slice(0, 5)
              .map((concept, index) => (
                <View
                  key={`review-${concept}`}
                  style={styles.reviewRow}
                >
                  <View style={styles.reviewNumber}>
                    <ThemedText
                      allowFontScaling={false}
                      style={styles.reviewNumberText}
                    >
                      {index + 1}
                    </ThemedText>
                  </View>

                  <ThemedText style={styles.reviewQuestion}>
                    How would you explain {concept} to someone
                    who missed this lecture?
                  </ThemedText>
                </View>
              ))}
          </View>
        </NotebookSection>
      ) : null}

      {/* ORIGINAL MATERIAL */}

      {originals.length > 0 ? (
        <NotebookSection
          number="09"
          eyebrow="STRAIGHT FROM CLASS"
          title="Your original material"
        >
          <View style={styles.originals}>
            {originals.map((uri, index) => (
              <View
                key={uri}
                style={styles.originalCard}
              >
                <Image
                  source={{ uri }}
                  style={styles.originalImage}
                  resizeMode="cover"
                  accessibilityLabel={
                    originals.length === 1
                      ? 'Original captured material for this lecture'
                      : `Original captured material ${index + 1} of ${originals.length}`
                  }
                />
              </View>
            ))}
          </View>

          <ThemedText
            type="small"
            themeColor="textSecondary"
          >
            {originals.length === 1
              ? 'The capture this notebook was built from. ClassLens organized around it — it never replaced it.'
              : 'The captures this notebook was built from. ClassLens organized around them — it never replaced them.'}
          </ThemedText>
        </NotebookSection>
      ) : null}

      {/* STUDY ACTIONS */}

      <NotebookSection
        number="10"
        eyebrow="STUDY WITH CLASSLENS"
        title="Go deeper"
      >
        <StudyActions key={lecture.id} lectureId={lecture.id} />
      </NotebookSection>

      {/* FOOTER */}

      <View style={styles.footer}>
        <View style={styles.footerMark} />

        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.footerText}
        >
          Organized from your class material by ClassLens
        </ThemedText>
      </View>
    </Screen>
  );
}

function NotebookSection({
  number,
  eyebrow,
  title,
  children,
}: {
  number: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText
          allowFontScaling={false}
          style={styles.sectionNumber}
        >
          {number}
        </ThemedText>

        <View style={styles.sectionHeaderCopy}>
          <ThemedText
            allowFontScaling={false}
            style={styles.sectionEyebrow}
          >
            {eyebrow}
          </ThemedText>

          <ThemedText style={styles.sectionTitle}>
            {title}
          </ThemedText>
        </View>
      </View>

      {children}
    </View>
  );
}

function MetaPill({
  label,
}: {
  label: string;
}) {
  return (
    <View style={styles.metaPill}>
      <View style={styles.metaPillDot} />

      <ThemedText
        type="small"
        style={styles.metaPillText}
      >
        {label}
      </ThemedText>
    </View>
  );
}

function ConceptDiagram({
  concepts,
}: {
  concepts: string[];
}) {
  const visible = concepts.slice(0, 4);

  return (
    <View style={styles.diagram}>
      <View style={styles.diagramHeader}>
        <ThemedText
          allowFontScaling={false}
          style={styles.diagramLabel}
        >
          CONCEPT FLOW
        </ThemedText>

        <ThemedText
          type="small"
          style={styles.onCardMuted}
        >
          Core learning path
        </ThemedText>
      </View>

      <View style={styles.diagramCanvas}>
        {visible.map((concept, index) => (
          <View
            key={`${concept}-${index}`}
            style={styles.diagramGroup}
          >
            <View
              style={[
                styles.diagramNode,
                index === 0 &&
                  styles.diagramNodePrimary,
              ]}
            >
              <ThemedText
                style={[
                  styles.diagramNodeText,
                  index === 0 &&
                    styles.diagramNodeTextPrimary,
                ]}
              >
                {concept}
              </ThemedText>
            </View>

            {index < visible.length - 1 ? (
              <View style={styles.connector}>
                <View style={styles.connectorLine} />

                <View style={styles.connectorArrow}>
                  <ThemedText
                    allowFontScaling={false}
                    style={styles.connectorArrowText}
                  >
                    ↓
                  </ThemedText>
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function formatDate(
  value: string
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return date.toLocaleDateString(
    'en-US',
    {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.55,
  },

  loadingState: {
    minHeight: 440,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },

  loadingTitle: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
  },

  loadingDescription: {
    maxWidth: 300,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 22,
  },

  topBar: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 4,
  },

  backButton: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 20,
    backgroundColor: '#E9EEE8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backIcon: {
    color: Brand.ink,
    fontSize: 30,
    lineHeight: 32,
    marginTop: -2,
  },

  topIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },

  topIdentityRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },

  courseBadge: {
    maxWidth: '100%',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: '#E4EFE5',
  },

  courseBadgeText: {
    color: '#315E43',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.7,
  },

  topMetaText: {
    flexShrink: 1,
  },

  topCourseTitle: {
    width: '100%',
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },

  hero: {
    width: '100%',
    minWidth: 0,
    gap: 12,
    paddingTop: 4,
  },

  statusRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  readyBadge: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#EDF3EB',
  },

  readyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Brand.forest,
  },

  readyText: {
    color: Brand.forest,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  dateText: {
    flexShrink: 1,
    fontSize: 11,
  },

  lectureTitle: {
    width: '100%',
    minWidth: 0,
    flexShrink: 1,
    fontFamily: Fonts.serif,
    fontSize: 29,
    lineHeight: 37,
    fontWeight: '400',
    letterSpacing: -0.8,
  },

  metadataRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  metaPill: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F0F3EE',
  },

  metaPillDot: {
    width: 5,
    height: 5,
    flexShrink: 0,
    borderRadius: 3,
    backgroundColor: '#C4A66A',
  },

  metaPillText: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 16,
    color: onCardMuted,
  },

  onCardMuted: {
    color: onCardMuted,
  },

  heroDescription: {
    width: '100%',
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 22,
  },

  rule: {
    width: '100%',
    height: 1,
    backgroundColor: '#DDE4DD',
  },

  section: {
    width: '100%',
    minWidth: 0,
    gap: 15,
    paddingVertical: 3,
  },

  sectionHeader: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  sectionNumber: {
    width: 26,
    flexShrink: 0,
    paddingTop: 2,
    color: '#839087',
    fontSize: 10,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  sectionHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },

  sectionEyebrow: {
    color: Brand.forest,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.1,
  },

  sectionTitle: {
    width: '100%',
    flexShrink: 1,
    fontFamily: Fonts.serif,
    fontSize: 22,
    lineHeight: 29,
    fontWeight: '400',
    letterSpacing: -0.4,
  },

  sectionDescription: {
    width: '100%',
    fontSize: 13,
    lineHeight: 20,
  },

  originals: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  originalCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 0,
    height: 190,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#E9EDE7',
    borderWidth: 1,
    borderColor: '#DDE4DD',
  },

  originalImage: {
    width: '100%',
    height: '100%',
  },

  summaryBlock: {
    width: '100%',
    minWidth: 0,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#F1F5EF',
    padding: 17,
    paddingLeft: 21,
  },

  summaryAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 4,
    backgroundColor: Brand.forest,
  },

  summaryText: {
    color: onCard,
    width: '100%',
    fontSize: 15,
    lineHeight: 25,
  },

  takeawayList: {
    width: '100%',
    gap: 9,
  },

  takeawayCard: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F5F7F3',
    borderWidth: 1,
    borderColor: '#E1E7DF',
  },

  takeawayIndex: {
    width: 29,
    height: 29,
    flexShrink: 0,
    borderRadius: 9,
    backgroundColor: Brand.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },

  takeawayIndexText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },

  takeawayText: {
    color: onCard,
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 22,
  },

  conceptGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  conceptChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#F4F7F3',
    borderWidth: 1,
    borderColor: '#DBE4DA',
  },

  conceptMarker: {
    width: 6,
    height: 6,
    flexShrink: 0,
    borderRadius: 3,
    backgroundColor: '#C4A66A',
  },

  conceptText: {
    flexShrink: 1,
    color: Brand.ink,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },

  notebookPaper: {
    width: '100%',
    minWidth: 0,
    position: 'relative',
    overflow: 'hidden',
    padding: 18,
    paddingLeft: 23,
    borderRadius: 19,
    backgroundColor: '#FAF7F0',
    borderWidth: 1,
    borderColor: '#ECE3D4',
    gap: 14,
  },

  notebookMargin: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 8,
    width: 2,
    backgroundColor: '#C4A66A',
    opacity: 0.75,
  },

  notebookLead: {
    color: onCard,
    width: '100%',
    fontSize: 15,
    lineHeight: 25,
  },

  notebookPoint: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },

  noteBullet: {
    width: 6,
    height: 6,
    flexShrink: 0,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: Brand.forest,
  },

  notebookPointText: {
    color: onCard,
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 23,
  },

  diagram: {
    width: '100%',
    minWidth: 0,
    borderRadius: 20,
    backgroundColor: '#EEF3ED',
    padding: 15,
    gap: 15,
    overflow: 'hidden',
  },

  diagramHeader: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 7,
  },

  diagramLabel: {
    color: Brand.forest,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  diagramCanvas: {
    width: '100%',
    alignItems: 'center',
  },

  diagramGroup: {
    width: '100%',
    alignItems: 'center',
  },

  diagramNode: {
    width: '88%',
    maxWidth: 330,
    minWidth: 0,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CFDACE',
  },

  diagramNodePrimary: {
    backgroundColor: Brand.forest,
    borderColor: Brand.forest,
  },

  diagramNodeText: {
    width: '100%',
    textAlign: 'center',
    color: Brand.ink,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },

  diagramNodeTextPrimary: {
    color: '#FFFFFF',
  },

  connector: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  connectorLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#A8B8AA',
  },

  connectorArrow: {
    paddingHorizontal: 5,
    backgroundColor: '#EEF3ED',
  },

  connectorArrowText: {
    color: Brand.forest,
    fontSize: 14,
  },

  examCard: {
    width: '100%',
    minWidth: 0,
    padding: 15,
    borderRadius: 18,
    backgroundColor: '#FBF4E6',
    borderWidth: 1,
    borderColor: '#D9BE84',
    gap: 12,
  },

  examHeading: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  examIcon: {
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: 9,
    backgroundColor: '#C4A66A',
    alignItems: 'center',
    justifyContent: 'center',
  },

  examIconText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },

  examHeadingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },

  examTitle: {
    color: '#6A5326',
    fontSize: 14,
    fontWeight: '800',
  },

  examItem: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },

  examBullet: {
    width: 7,
    height: 7,
    flexShrink: 0,
    borderRadius: 4,
    marginTop: 7,
    backgroundColor: '#C4A66A',
  },

  examText: {
    color: onCard,
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 22,
  },

  assignmentList: {
    width: '100%',
    gap: 9,
  },

  assignmentCard: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DEE5DD',
  },

  checkbox: {
    width: 21,
    height: 21,
    flexShrink: 0,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Brand.forest,
  },

  assignmentCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },

  assignmentNumber: {
    color: Brand.forest,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },

  assignmentText: {
    color: onCard,
    width: '100%',
    fontSize: 14,
    lineHeight: 22,
  },

  reviewList: {
    width: '100%',
    gap: 5,
  },

  reviewRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
  },

  reviewNumber: {
    width: 27,
    height: 27,
    flexShrink: 0,
    borderRadius: 14,
    backgroundColor: '#E5EFE5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  reviewNumberText: {
    color: Brand.forest,
    fontSize: 10,
    fontWeight: '800',
  },

  reviewQuestion: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
    fontSize: 14,
    lineHeight: 22,
  },

  footer: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 20,
    gap: 12,
  },

  footerMark: {
    width: 42,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#C4A66A',
  },

  footerText: {
    maxWidth: 280,
    textAlign: 'center',
    lineHeight: 18,
  },
});
