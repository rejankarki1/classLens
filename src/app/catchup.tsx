import {
  ActivityIndicator,
  Animated,
  Image,
  ScrollView,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import {
  router,
  useFocusEffect,
} from 'expo-router';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { AddFriendSheet } from '@/components/AddFriendSheet';
import { getInitials } from '@/features/profile/initials';
import { ClassLensLogo } from '@/components/ClassLensLogo';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/Screen';

import { getCourses } from '@/services/courses';
import { getMyEnrolledCourses } from '@/services/enrollment';
import { copyLectureToMyNotes, getMyCopyOf, getLecturesByOwners } from '@/services/lectures';
import { getFriends } from '@/services/friends';
import { getMaterials, getMaterialUrl } from '@/services/materials';

import { Brand, Fonts } from '@/constants/theme';
import type {
  Course,
  Lecture,
  Profile,
} from '@/types';

type CatchUpItem = {
  lecture: Lecture;
  course?: Course;
  /** The classmate whose notebook this came from. */
  sharedBy?: Profile;
  photos: { id: string; url: string | null }[];
};

export default function CatchUpScreen() {
  const [item, setItem] =
    useState<CatchUpItem | null>(null);

  const [loading, setLoading] =
    useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadSequence = useRef(0);

  const [sheetOpen, setSheetOpen] =
    useState(false);

  const [copied, setCopied] = useState<Lecture | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const added = copied !== null;

  const [error, setError] =
    useState(false);

  const [friends, setFriends] =
    useState<Profile[]>([]);

  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [friendOpen, setFriendOpen] =
    useState(false);

  const [adding, setAdding] =
    useState(false);

  const load = useCallback(async (initial: boolean) => {
    const sequence = ++loadSequence.current;
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(false);

    try {
      const [accepted, enrolled] = await Promise.all([getFriends(), getMyEnrolledCourses()]);
      const shared = await getLecturesByOwners(accepted.map((friend) => friend.id));
      if (sequence !== loadSequence.current) return;

      setFriends(accepted);
      setEnrolledCourses(enrolled);
      const lecture = shared[0];
      if (!lecture) {
        setItem(null);
        setCopied(null);
        return;
      }

      const [courses, materials, existingCopy] = await Promise.all([
        getCourses(),
        getMaterials(lecture.id),
        getMyCopyOf(lecture.id),
      ]);
      const photos = await Promise.all(
        materials
          .filter((material) => material.type === 'photo')
          .map(async (material) => ({
            id: material.id,
            url: await getMaterialUrl(material),
          })),
      );
      if (sequence !== loadSequence.current) return;

      setItem({
        photos,
        lecture,
        course: courses.find((course) => course.id === lecture.courseId),
        sharedBy: accepted.find((friend) => friend.id === lecture.ownerId),
      });
      setCopied(existingCopy);
    } catch {
      if (sequence === loadSequence.current) setError(true);
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(true);

      return () => {
        loadSequence.current += 1;
      };
    }, [load])
  );

  async function copyInto(courseId?: string) {
    if (!item || adding) return;
    setAdding(true);
    setCopyError(null);
    try {
      const lecture = await copyLectureToMyNotes(item.lecture.id, courseId);
      setCopied(lecture);
      setPickerOpen(false);
    } catch (caught) {
      setCopyError(caught instanceof Error ? caught.message : 'Could not add these notes. Try again.');
    } finally {
      setAdding(false);
    }
  }

  function addToMyNotes() {
    if (!item || added || adding) return;
    const enrolledInSource = enrolledCourses.some((course) => course.id === item.lecture.courseId);
    if (enrolledInSource) void copyInto();
    else setPickerOpen(true);
  }

  function openCopy() {
    if (!copied) return;
    setSheetOpen(false);
    router.push({ pathname: '/lecture/[id]', params: { id: copied.id } });
  }

  return (
    <Screen
      showBottomNav
      refreshing={refreshing}
      onRefresh={() => void load(false)}
    >
      <View style={styles.header}>
        <ClassLensLogo compact />

        <View style={styles.headerText}>
          <ThemedText
            allowFontScaling={false}
            style={styles.eyebrow}
          >
            CATCHUP
          </ThemedText>

          <ThemedText
            type="title"
            style={styles.title}
          >
            Missed class?
          </ThemedText>
        </View>

      </View>

      <ThemedText
        themeColor="textSecondary"
        style={styles.description}
      >
        When you miss a lecture, CatchUp surfaces notes
        shared by classmates so you can get back on track fast.
      </ThemedText>

      {/* Friend search and requests power real CatchUp sharing. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add CatchUp Friend"
        accessibilityHint="Search classmates and send a friend request"
        onPress={() => setFriendOpen(true)}
        style={({ pressed }) => [
          styles.friendCard,
          pressed && styles.friendCardPressed,
        ]}
      >
        <View style={styles.friendIcon}>
          <ThemedText
            allowFontScaling={false}
            style={styles.friendIconText}
          >
            👥
          </ThemedText>

          <View style={styles.friendPlusBadge}>
            <ThemedText
              allowFontScaling={false}
              style={styles.friendPlusText}
            >
              +
            </ThemedText>
          </View>
        </View>

        <View style={styles.friendCopy}>
          <ThemedText style={styles.friendTitle}>
            Add CatchUp Friend
          </ThemedText>

          <ThemedText
            type="small"
            style={styles.friendDescription}
          >
            {friends.length
              ? `Sharing with ${friends.map((friend) => friend.name).join(', ')}.`
              : 'Connect with a classmate who can share notes when you miss class.'}
          </ThemedText>
        </View>

        <View style={styles.friendAction}>
          <ThemedText
            allowFontScaling={false}
            style={styles.friendActionText}
          >
            +
          </ThemedText>
        </View>
      </Pressable>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={Brand.lime} accessibilityLabel="Checking what you missed" />
          <ThemedText style={styles.loadingTitle}>
            Checking what you missed...
          </ThemedText>

          <ThemedText
            style={styles.loadingMuted}
          >
            Looking for shared notes from your courses.
          </ThemedText>
        </View>
      ) : error ? (
        <View style={styles.loadingCard}>
          <ThemedText style={styles.loadingTitle}>
            CatchUp is unavailable
          </ThemedText>

          <ThemedText
            style={styles.loadingMuted}
          >
            We couldn&apos;t load your CatchUp information.
          </ThemedText>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try loading CatchUp again"
            onPress={() => void load(false)}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <ThemedText allowFontScaling={false} style={styles.retryText}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : item ? (
        <CatchUpAlert
          item={item}
          onOpen={() =>
            setSheetOpen(true)
          }
        />
      ) : friends.length ? (
        <CatchUpEmptyState friendCount={friends.length} />
      ) : null}

      <View style={styles.howItWorks}>
        <ThemedText style={styles.howTitle}>
          How CatchUp works
        </ThemedText>

        <Step
          number="01"
          title="Add classmates"
          body="Search for classmates by name and send a request for them to accept."
        />

        <Step
          number="02"
          title="Classmates capture their lectures"
          body="Their captured lectures become notes they can share through CatchUp."
        />

        <Step
          number="03"
          title="Add shared notes to your notebook"
          body="See their notes on CatchUp and tap “Add to My Notes” to copy them into your notebook."
        />
      </View>

      <CatchUpSheet
        visible={sheetOpen}
        item={item}
        added={added}
        busy={adding}
        copyError={copyError}
        onClose={() =>
          setSheetOpen(false)
        }
        onAdd={addToMyNotes}
        onOpenCopy={openCopy}
      />

      <CourseChoiceSheet
        visible={pickerOpen}
        courses={enrolledCourses}
        busy={adding}
        onChoose={(course) => void copyInto(course.id)}
        onClose={() => { if (!adding) setPickerOpen(false); }}
      />

      <AddFriendSheet
        visible={friendOpen}
        onClose={() => setFriendOpen(false)}
        onChanged={() => void load(false)}
      />
    </Screen>
  );
}

function CatchUpEmptyState({ friendCount }: { friendCount: number }) {
  return (
    <View style={styles.loadingCard}>
      <ThemedText style={styles.loadingTitle}>
        Nothing to catch up on yet.
      </ThemedText>

      <ThemedText style={styles.loadingMuted}>
        {friendCount === 1
          ? 'Your classmate hasn’t shared any notes yet.'
          : 'Your classmates haven’t shared any notes yet.'}
      </ThemedText>
    </View>
  );
}

function CatchUpAlert({
  item,
  onOpen,
}: {
  item: CatchUpItem;
  onOpen: () => void;
}) {
  const [bounce] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation =
      Animated.loop(
        Animated.sequence([
          Animated.timing(
            bounce,
            {
              toValue: -7,
              duration: 700,
              useNativeDriver: true,
            }
          ),

          Animated.timing(
            bounce,
            {
              toValue: 0,
              duration: 700,
              useNativeDriver: true,
            }
          ),
        ])
      );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [bounce]);

  const courseCode =
    item.course?.code ??
    'YOUR COURSE';

  return (
    <Animated.View
      style={{
        transform: [
          {
            translateY: bounce,
          },
        ],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Review missed class"
        onPress={onOpen}
        style={({ pressed }) => [
          styles.alertCard,
          pressed &&
            styles.pressed,
        ]}
      >
        <View style={styles.alertTop}>
          <View style={styles.alarmIcon}>
            <ThemedText
              allowFontScaling={false}
              style={styles.alarmText}
            >
              !
            </ThemedText>

            <View style={styles.alarmDot} />
          </View>

          <View style={styles.alertCopy}>
            <View style={styles.alertLabelRow}>
              <ThemedText
                allowFontScaling={false}
                style={styles.alertLabel}
              >
                CATCHUP AVAILABLE
              </ThemedText>

              <View style={styles.newPill}>
                <ThemedText
                  allowFontScaling={false}
                  style={styles.newPillText}
                >
                  NEW
                </ThemedText>
              </View>
            </View>

            <ThemedText style={styles.alertTitle}>
              You missed a lecture.
            </ThemedText>

            <ThemedText style={styles.alertSubtitle}>
              Don&apos;t worry — a classmate shared notes from {courseCode}.
            </ThemedText>
          </View>
        </View>

        <View style={styles.alertDivider} />

        <View style={styles.missedStrip}>
          <View style={styles.avatar}>
            <ThemedText
              allowFontScaling={false}
              style={styles.avatarText}
            >
              {item.sharedBy ? getInitials(item.sharedBy.name) : '··'}
            </ThemedText>
          </View>

          <View style={styles.missedCopy}>
            <ThemedText style={styles.missedHeadline}>
              {item.lecture.title}
            </ThemedText>

            <ThemedText
              type="small"
              style={styles.missedDescription}
              numberOfLines={2}
            >
              Shared by {item.sharedBy?.name ?? 'a classmate'} · {courseCode} · {item.course?.name}
            </ThemedText>
          </View>

          <View style={styles.reviewButton}>
            <ThemedText
              allowFontScaling={false}
              style={styles.reviewText}
            >
              Review Notes →
            </ThemedText>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function CatchUpSheet({
  visible,
  item,
  added,
  busy,
  copyError,
  onClose,
  onAdd,
  onOpenCopy,
}: {
  visible: boolean;
  item: CatchUpItem | null;
  added: boolean;
  busy: boolean;
  copyError: string | null;
  onClose: () => void;
  onAdd: () => void;
  onOpenCopy: () => void;
}) {
  const courseCode =
    item?.course?.code ??
    'YOUR COURSE';

  const courseName =
    item?.course?.name ??
    'Shared lecture';

  const concepts = item?.lecture.keyConcepts ?? [];
  const friendName = item?.sharedBy?.name ?? 'a classmate';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.scrim}
        onPress={onClose}
      >
        <Pressable
          style={styles.sheet}
          onPress={(event) =>
            event.stopPropagation()
          }
        >
          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator contentContainerStyle={styles.sheetScrollContent}>
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <ThemedText style={styles.sheetTitle}>
                {item?.lecture.title ?? 'CatchUp available'}
              </ThemedText>

              <View style={styles.coursePill}>
                <ThemedText
                  allowFontScaling={false}
                  style={styles.coursePillText}
                >
                  {courseCode} · {courseName}
                </ThemedText>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close CatchUp"
              onPress={onClose}
              style={styles.closeButton}
            >
              <ThemedText
                allowFontScaling={false}
                style={styles.closeText}
              >
                ×
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.missedDateRow}>
            <ThemedText
              allowFontScaling={false}
              style={styles.calendarIcon}
            >
              ◷
            </ThemedText>

            <ThemedText style={styles.missedDateText}>
              You didn&apos;t capture this lecture
            </ThemedText>
          </View>

          <View style={styles.sharedBy}>
            <View style={styles.sharedAvatar}>
              <ThemedText
                allowFontScaling={false}
                style={styles.sharedAvatarText}
              >
                {item?.sharedBy ? getInitials(item.sharedBy.name) : '··'}
              </ThemedText>
            </View>

            <View style={styles.sharedByCopy}>
              <ThemedText style={styles.sharedByName}>
                {item?.sharedBy?.name ?? 'Classmate share'}
              </ThemedText>

              <ThemedText
                type="small"
                style={styles.mutedText}
              >
                Shared lecture material with your course
              </ThemedText>
            </View>
          </View>

          {item?.photos.map((photo) => photo.url ? (
            <Image key={photo.id} source={{ uri: photo.url }} resizeMode="contain"
              accessibilityLabel="Original shared lecture notes photo" style={styles.originalPhoto} />
          ) : (
            <ThemedText key={photo.id} style={styles.mutedText}>Photo temporarily unavailable. Reopen to retry.</ThemedText>
          ))}
          <View style={styles.coveredCard}>
            <ThemedText style={styles.coveredTitle}>Summary</ThemedText>
            <ThemedText style={styles.mutedText}>{item?.lecture.summary}</ThemedText>
          </View>

          <View style={styles.coveredCard}>
            <ThemedText style={styles.coveredTitle}>
              What&apos;s covered
            </ThemedText>

            <View style={styles.topicChips}>
              {concepts.length ? (
                concepts.map(
                  (concept) => (
                    <View
                      key={concept}
                      style={styles.topicChip}
                    >
                      <ThemedText
                        style={styles.topicChipText}
                      >
                        {concept}
                      </ThemedText>
                    </View>
                  )
                )
              ) : (
                <>
                  <View style={styles.topicChip}>
                    <ThemedText style={styles.topicChipText}>
                      Lecture notes
                    </ThemedText>
                  </View>

                  <View style={styles.topicChip}>
                    <ThemedText style={styles.topicChipText}>
                      Key concepts
                    </ThemedText>
                  </View>
                </>
              )}
            </View>
          </View>

          <View style={styles.coveredCard}>
            <ThemedText style={styles.coveredTitle}>Important points</ThemedText>
            {item?.lecture.importantPoints.map((point, index) => (
              <ThemedText key={index} style={styles.mutedText}>• {point}</ThemedText>
            ))}
          </View>

          <View style={styles.consent}>
            <ThemedText
              allowFontScaling={false}
              style={styles.lock}
            >
              ◇
            </ThemedText>

            <ThemedText
              type="small"
              style={styles.consentText}
            >
              CatchUp sharing should only surface material from classmates who have opted into course sharing.
            </ThemedText>
          </View>
          </ScrollView>

          {/* Sticky footer: always visible, independent of scroll position. */}
          <View style={styles.sheetFooter}>
            {copyError ? <ThemedText accessibilityRole="alert" style={styles.errorText}>{copyError}</ThemedText> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={added ? onOpenCopy : onAdd}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || busy) &&
                  styles.pressed,
              ]}
            >
              <ThemedText
                style={styles.primaryButtonText}
              >
                {added
                  ? 'Open in my notes →'
                  : busy
                    ? 'Adding…'
                    : '+ Add to My Notes'}
              </ThemedText>
            </Pressable>

            <ThemedText
              type="small"
              style={styles.copyNote}
            >
              {added
                ? `✓ Copied from ${friendName}. Your edits won’t affect the original.`
                : 'This creates your own copy. Your edits won’t affect the original shared notes.'}
            </ThemedText>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CourseChoiceSheet({
  visible,
  courses,
  busy,
  onChoose,
  onClose,
}: {
  visible: boolean;
  courses: Course[];
  busy: boolean;
  onChoose: (course: Course) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.choiceSheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />

          <ThemedText style={styles.choiceTitle}>Which course are these notes for?</ThemedText>
          <ThemedText type="small" style={styles.mutedText}>
            You&apos;re not enrolled in the original course, so pick one of yours.
          </ThemedText>

          {courses.length ? (
            <View style={styles.choiceList}>
              {courses.map((course) => (
                <Pressable
                  key={course.id}
                  accessibilityRole="button"
                  accessibilityLabel={`File in ${course.code}, ${course.name}`}
                  disabled={busy}
                  onPress={() => onChoose(course)}
                  style={({ pressed }) => [styles.choiceRow, (pressed || busy) && styles.pressed]}
                >
                  <View style={styles.choiceCopy}>
                    <ThemedText style={styles.choiceCode}>{course.code}</ThemedText>
                    <ThemedText type="small" style={styles.mutedText}>{course.name}</ThemedText>
                  </View>
                  <ThemedText style={styles.choiceArrow}>→</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : (
            <ThemedText style={styles.mutedText}>
              You&apos;re not enrolled in any courses yet. Add one from the Courses tab first.
            </ThemedText>
          )}

          <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.choiceCancel, pressed && styles.pressed]}>
            <ThemedText style={styles.choiceCancelText}>Cancel</ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Step({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <ThemedText
          allowFontScaling={false}
          style={styles.stepNumberText}
        >
          {number}
        </ThemedText>
      </View>

      <View style={styles.stepCopy}>
        <ThemedText style={styles.stepTitle}>
          {title}
        </ThemedText>

        <ThemedText
          themeColor="textSecondary"
          style={styles.stepBody}
        >
          {body}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mutedText: {
    color: '#C7D7CD',
  },

  header: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  headerText: {
    flex: 1,
    minWidth: 0,
  },

  eyebrow: {
    color: Brand.forest,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  title: {
    width: '100%',
    flexShrink: 1,
    fontFamily: Fonts.serif,
    fontWeight: '400',
    letterSpacing: -1,
  },

  description: {
    width: '100%',
    fontSize: 14,
    lineHeight: 22,
  },

  friendCard: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: Brand.forest,
    boxShadow: '0px 4px 14px rgba(0,0,0,0.18)',
  },

  friendCardPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },

  friendIcon: {
    width: 46,
    height: 46,
    flexShrink: 0,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  friendIconText: {
    fontSize: 21,
    lineHeight: 27,
  },

  friendPlusBadge: {
    position: 'absolute',
    right: -4,
    bottom: -3,
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#C4A66A',
    borderWidth: 2,
    borderColor: Brand.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },

  friendPlusText: {
    color: '#183E2A',
    fontSize: 13,
    lineHeight: 14,
    fontWeight: '900',
  },

  friendCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },

  friendTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },

  friendDescription: {
    color: '#DCE7DA',
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 16,
  },

  friendAction: {
    width: 34,
    height: 34,
    flexShrink: 0,
    borderRadius: 17,
    backgroundColor: Brand.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },

  friendActionText: {
    color: Brand.ink,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '500',
  },

  loadingCard: {
    width: '100%',
    padding: 18,
    borderRadius: 19,
    backgroundColor: Brand.forest,
    gap: 6,
  },

  loadingTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

  loadingMuted: {
    color: '#DCE7DA',
  },

  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    minHeight: 40,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: Brand.lime,
  },

  retryText: {
    color: Brand.ink,
    fontSize: 13,
    fontWeight: '800',
  },

  alertCard: {
    width: '100%',
    minWidth: 0,
    padding: 20,
    borderRadius: 26,
    backgroundColor: '#123F2B',
    borderWidth: 1,
    borderColor: '#2E6948',
    boxShadow: '0px 9px 18px rgba(18,63,43,0.22)',
  },

  alertTop: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  alarmIcon: {
    width: 54,
    height: 54,
    flexShrink: 0,
    borderRadius: 27,
    backgroundColor: '#E5C477',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  alarmText: {
    color: '#183E2A',
    fontSize: 24,
    fontWeight: '900',
  },

  alarmDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#183E2A',
  },

  alertCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },

  alertLabelRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },

  alertLabel: {
    color: '#C4A66A',
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },

  newPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F4E9CC',
  },

  newPillText: {
    color: '#725A27',
    fontSize: 7,
    fontWeight: '900',
  },

  alertTitle: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
  },

  alertSubtitle: {
    color: '#D9E6DC',
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 18,
  },

  alertDivider: {
    height: 1,
    marginVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },

  missedStrip: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  avatar: {
    width: 35,
    height: 35,
    flexShrink: 0,
    borderRadius: 18,
    backgroundColor: '#C4A66A',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#183E2A',
    fontSize: 9,
    fontWeight: '900',
  },

  missedCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },

  missedDescription: {
    color: '#C7D7CD',
    fontSize: 11,
    lineHeight: 16,
  },

  missedHeadline: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },

  reviewButton: {
    flexShrink: 0,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },

  reviewText: {
    color: Brand.forest,
    fontSize: 10,
    fontWeight: '900',
  },

  pressed: {
    opacity: 0.75,
  },

  howItWorks: {
    width: '100%',
    gap: 8,
    paddingTop: 4,
  },

  howTitle: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    lineHeight: 29,
  },

  step: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    gap: 11,
    paddingVertical: 9,
  },

  stepNumber: {
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: 11,
    backgroundColor: '#E6EFE5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  stepNumberText: {
    color: Brand.forest,
    fontSize: 9,
    fontWeight: '900',
  },

  stepCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },

  stepTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
  },

  stepBody: {
    fontSize: 12,
    lineHeight: 19,
  },

  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor:
      'rgba(20,28,22,0.45)',
  },

  sheet: {
    width: '100%',
    maxHeight: '88%',
    paddingHorizontal: 20,
    paddingTop: 9,
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    backgroundColor: '#123F2B',
  },

  sheetScroll: {
    flex: 1,
  },

  sheetScrollContent: {
    paddingBottom: 16,
  },

  handle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    marginBottom: 15,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },

  sheetHeader: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  sheetHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },

  sheetTitle: {
    color: '#FFFFFF',
    fontFamily: Fonts.serif,
    fontSize: 23,
    lineHeight: 30,
  },

  coursePill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },

  coursePillText: {
    color: '#DCE7DA',
    fontSize: 10,
    fontWeight: '800',
  },

  closeButton: {
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeText: {
    color: '#FFFFFF',
    fontSize: 19,
  },

  missedDateRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 15,
  },

  calendarIcon: {
    color: Brand.lime,
    fontSize: 16,
  },

  missedDateText: {
    color: '#C7D7CD',
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 19,
  },

  sharedBy: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 14,
    padding: 12,
    borderRadius: 13,
    backgroundColor: '#1B3B2D',
  },

  sharedAvatar: {
    width: 39,
    height: 39,
    flexShrink: 0,
    borderRadius: 20,
    backgroundColor: '#6D5622',
    alignItems: 'center',
    justifyContent: 'center',
  },

  sharedAvatarText: {
    color: '#FFF7E9',
    fontSize: 10,
    fontWeight: '900',
  },

  sharedByCopy: {
    flex: 1,
    minWidth: 0,
  },

  sharedByName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  originalPhoto: {
    width: '100%',
    aspectRatio: 0.75,
    marginTop: 15,
    borderRadius: 11,
    backgroundColor: '#1B3B2D',
  },

  coveredCard: {
    width: '100%',
    marginTop: 15,
    padding: 14,
    borderRadius: 13,
    backgroundColor: '#1B3B2D',
    gap: 9,
  },

  coveredTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  topicChips: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },

  topicChip: {
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },

  topicChipText: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
  },

  consent: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },

  lock: {
    color: '#A9C2B2',
    flexShrink: 0,
    fontSize: 13,
  },

  consentText: {
    color: '#C7D7CD',
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    lineHeight: 16,
  },

  sheetFooter: {
    width: '100%',
    paddingTop: 14,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },

  errorText: {
    color: '#F3C7C7',
    marginBottom: 8,
    lineHeight: 20,
  },

  primaryButton: {
    width: '100%',
    minHeight: 53,
    borderRadius: 999,
    backgroundColor: Brand.lime,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  primaryButtonText: {
    color: Brand.ink,
    fontSize: 14,
    fontWeight: '900',
  },

  copyNote: {
    color: '#C7D7CD',
    marginTop: 9,
    textAlign: 'center',
    lineHeight: 17,
  },

  choiceSheet: {
    width: '100%',
    maxHeight: '80%',
    paddingHorizontal: 20,
    paddingTop: 9,
    paddingBottom: 34,
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    backgroundColor: '#123F2B',
    gap: 6,
  },

  choiceTitle: {
    color: '#FFFFFF',
    fontFamily: Fonts.serif,
    fontSize: 20,
    lineHeight: 26,
  },

  choiceList: {
    gap: 8,
    marginTop: 10,
  },

  choiceRow: {
    minHeight: 64,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#1B3B2D',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  choiceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },

  choiceCode: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  choiceArrow: {
    color: Brand.lime,
    fontSize: 18,
  },

  choiceCancel: {
    minHeight: 48,
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  choiceCancelText: {
    color: '#DCE7DA',
    fontWeight: '700',
  },
});
