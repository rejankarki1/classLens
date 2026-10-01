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
import { copyLectureToMyNotes, getLecturesByOwners } from '@/services/lectures';
import { getFriends } from '@/services/friends';
import { getMaterials, getMaterialUrl } from '@/services/materials';

import { Brand, Colors, Fonts } from '@/constants/theme';
import type {
  Course,
  Lecture,
  Profile,
} from '@/types';

// The sheet and its cards are painted a fixed cream, so text on them must use
// the fixed dark palette. Inheriting theme.text turns them invisible in dark mode.
const onCard = Colors.light.text;
const onCardMuted = Colors.light.textSecondary;

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
      const accepted = await getFriends();
      const shared = await getLecturesByOwners(accepted.map((friend) => friend.id));
      if (sequence !== loadSequence.current) return;

      setFriends(accepted);
      const lecture = shared[0];
      if (!lecture) {
        setItem(null);
        return;
      }

      const [courses, materials] = await Promise.all([
        getCourses(),
        getMaterials(lecture.id),
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

  async function addToMyNotes() {
    if (!item || added || adding) return;
    setAdding(true);
    setCopyError(null);
    try {
      const lecture = await copyLectureToMyNotes(item.lecture.id);
      setCopied(lecture);
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : 'Could not add these notes. Try again.');
    } finally {
      setAdding(false);
    }
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
          <ActivityIndicator color={Brand.forest} accessibilityLabel="Checking what you missed" />
          <ThemedText style={styles.loadingTitle}>
            Checking what you missed...
          </ThemedText>

          <ThemedText
            style={styles.onCardMuted}
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
            style={styles.onCardMuted}
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
      ) : (
        <CatchUpEmptyState />
      )}

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
        copiedId={copied?.id}
        copyError={copyError}
        onClose={() =>
          setSheetOpen(false)
        }
        onAdd={addToMyNotes}
      />

      <AddFriendSheet
        visible={friendOpen}
        onClose={() => setFriendOpen(false)}
        onChanged={() => void load(false)}
      />
    </Screen>
  );
}

function CatchUpEmptyState() {
  return (
    <View style={styles.loadingCard}>
      <ThemedText style={styles.loadingTitle}>
        Add classmates to see their shared notes.
      </ThemedText>

      <ThemedText style={styles.onCardMuted}>
        Accepted classmates and their latest notes will appear here.
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
  copiedId,
  copyError,
  onClose,
  onAdd,
}: {
  visible: boolean;
  item: CatchUpItem | null;
  added: boolean;
  busy: boolean;
  copiedId?: string;
  copyError: string | null;
  onClose: () => void;
  onAdd: () => void;
}) {
  const courseCode =
    item?.course?.code ??
    'YOUR COURSE';

  const courseName =
    item?.course?.name ??
    'Shared lecture';

  const concepts = item?.lecture.keyConcepts ?? [];

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
          <ScrollView showsVerticalScrollIndicator contentContainerStyle={{ paddingBottom: 12 }}>
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
                style={styles.onCardMuted}
              >
                Shared lecture material with your course
              </ThemedText>
            </View>
          </View>

          {item?.photos.map((photo) => photo.url ? (
            <Image key={photo.id} source={{ uri: photo.url }} resizeMode="contain"
              accessibilityLabel="Original shared lecture notes photo" style={styles.originalPhoto} />
          ) : (
            <ThemedText key={photo.id} style={styles.onCardMuted}>Photo temporarily unavailable. Reopen to retry.</ThemedText>
          ))}
          <View style={styles.coveredCard}>
            <ThemedText style={styles.coveredTitle}>Summary</ThemedText>
            <ThemedText style={styles.onCardMuted}>{item?.lecture.summary}</ThemedText>
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
              <ThemedText key={index} style={styles.onCardMuted}>• {point}</ThemedText>
            ))}
          </View>
          {copyError ? <ThemedText accessibilityRole="alert" style={styles.onCardMuted}>{copyError}</ThemedText> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: added || busy, busy }}
            disabled={added || busy}
            onPress={onAdd}
            style={({ pressed }) => [
              styles.primaryButton,
              added &&
                styles.primaryButtonAdded,
              (pressed || busy) &&
                styles.pressed,
            ]}
          >
            <ThemedText
              style={styles.primaryButtonText}
            >
              {added
                ? '✓ Added to My Notes'
                : busy
                  ? 'Adding…'
                  : '+ Add to My Notes'}
            </ThemedText>
          </Pressable>

          <ThemedText
            type="small"
            style={styles.copyNote}
          >
            This creates your own copy. Your edits won&apos;t affect the original shared notes.
          </ThemedText>

          {item ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();

                router.push({
                  pathname:
                    '/lecture/[id]',
                  params: {
                    id:
                      copiedId ?? item.lecture.id,
                  },
                });
              }}
              style={({ pressed }) => [
                styles.openNotebook,
                pressed &&
                  styles.pressed,
              ]}
            >
              <ThemedText
                style={styles.openNotebookText}
              >
                {copiedId ? 'Open My Notes →' : 'Open Shared Lecture →'}
              </ThemedText>
            </Pressable>
          ) : null}

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
  onCardMuted: {
    color: onCardMuted,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E5DE',
    shadowColor: '#183E2A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 2,
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
    backgroundColor: '#EDF3EC',
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
    borderColor: '#FFFFFF',
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
    color: '#183E2A',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },

  friendDescription: {
    color: onCardMuted,
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 16,
  },

  friendAction: {
    width: 34,
    height: 34,
    flexShrink: 0,
    borderRadius: 17,
    backgroundColor: '#183E2A',
    alignItems: 'center',
    justifyContent: 'center',
  },

  friendActionText: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '500',
  },

  loadingCard: {
    width: '100%',
    padding: 18,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    gap: 6,
  },

  loadingTitle: {
    color: onCard,
    fontSize: 17,
    fontWeight: '700',
  },

  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    minHeight: 40,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: Brand.forest,
  },

  retryText: {
    color: '#FFFFFF',
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

    shadowColor: '#123F2B',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 9,
    },

    elevation: 8,
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
    paddingBottom: 34,
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    backgroundColor: '#F7FAF4',
  },

  handle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    marginBottom: 15,
    borderRadius: 2,
    backgroundColor: '#C1C9BF',
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
    color: onCard,
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
    backgroundColor: '#ECEFE9',
  },

  coursePillText: {
    color: '#5D685F',
    fontSize: 10,
    fontWeight: '800',
  },

  closeButton: {
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: 16,
    backgroundColor: '#EBEFEB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeText: {
    color: '#566158',
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
    color: Brand.forest,
    fontSize: 16,
  },

  missedDateText: {
    color: onCardMuted,
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
    backgroundColor: '#EFF4ED',
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
    color: onCard,
    fontSize: 14,
    fontWeight: '800',
  },

  originalPhoto: {
    width: '100%',
    aspectRatio: 0.75,
    marginTop: 15,
    borderRadius: 11,
    backgroundColor: '#E7EBE4',
  },

  coveredCard: {
    width: '100%',
    marginTop: 15,
    padding: 14,
    borderRadius: 13,
    backgroundColor: '#EEF3EC',
    gap: 9,
  },

  coveredTitle: {
    color: onCard,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD2C8',
  },

  topicChipText: {
    color: onCard,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
  },

  primaryButton: {
    width: '100%',
    minHeight: 53,
    marginTop: 17,
    borderRadius: 999,
    backgroundColor: Brand.forest,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  primaryButtonAdded: {
    backgroundColor: '#2E6544',
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },

  copyNote: {
    color: onCardMuted,
    marginTop: 9,
    textAlign: 'center',
    lineHeight: 17,
  },

  openNotebook: {
    minHeight: 45,
    marginTop: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },

  openNotebookText: {
    color: Brand.forest,
    fontSize: 13,
    fontWeight: '800',
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
    borderTopColor: '#D5DDD3',
  },

  lock: {
    // #7A857C measured at 3.64:1 on this background -- below WCAG AA's 4.5:1.
    // Darkened to 5.01:1, same hue.
    color: '#656E66',
    flexShrink: 0,
    fontSize: 13,
  },

  consentText: {
    color: onCardMuted,
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    lineHeight: 16,
  },
});
