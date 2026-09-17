import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

import { ClassLensBrandMark } from "@/components/ClassLensBrandMark";
import { CourseCard } from "@/components/CourseCard";
import { LectureCard } from "@/components/LectureCard";
import { ScanArtwork } from "@/components/ScanArtwork";
import { ThemedText } from "@/components/themed-text";
import { AppButton } from "@/components/ui/AppButton";
import {
  EmptyState,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/Editorial";
import { Screen } from "@/components/ui/Screen";
import { Brand, Fonts } from "@/constants/theme";
import { getInitials } from "@/features/profile/initials";
import { getMyProfile } from "@/services/auth";
import { getMyEnrolledCourses } from "@/services/enrollment";
import { getLectures } from "@/services/lectures";
import type { Course, Lecture, Profile } from "@/types";

export default function HomeScreen() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [recent, setRecent] = useState<Lecture[]>([]);

  const [recentError, setRecentError] = useState(false);
  const [recentLoading, setRecentLoading] = useState(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      setLoading(true);
      setError(false);
      setRecentError(false);
      setRecentLoading(true);

      getMyProfile()
        .then((data) => { if (active) setProfile(data); })
        .catch(() => { if (active) setProfile(null); });

      getMyEnrolledCourses()
        .then(async (data) => {
          if (!active) return;

          setCourses(data);
          setLoading(false);

          const results = await Promise.allSettled(
            data.map((course) => getLectures(course.id)),
          );

          if (!active) return;

          const latestLectures = results
            .flatMap((result) =>
              result.status === "fulfilled" ? result.value : [],
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 2);

          setRecent(latestLectures);
          setRecentError(
            results.some((result) => result.status === "rejected"),
          );
          setRecentLoading(false);
        })
        .catch(() => {
          if (active) {
            setError(true);
            setRecentLoading(false);
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });

      return () => {
        active = false;
      };

      // Retry intentionally creates a new focused request.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]),
  );

  return (
    <>
      <Screen showBottomNav>
        {/* ───────────────── TOP BAR ───────────────── */}

        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            onPress={() => setMenuOpen(true)}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <ThemedText style={styles.menuIcon}>☰</ThemedText>
          </Pressable>

          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <ClassLensBrandMark size={42} />
            </View>

            <ThemedText style={styles.brandName}>ClassLens</ThemedText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => setProfileOpen(true)}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
          >
            <ThemedText style={styles.avatarText}>
              {profile ? getInitials(profile.name) || "·" : "·"}
            </ThemedText>
          </Pressable>
        </View>

        {/* ───────────────── INTRO ───────────────── */}

        <View style={styles.intro}>
          <ThemedText type="smallBold" style={styles.eyebrow}>
            YOUR LEARNING, IN FOCUS
          </ThemedText>

          <ThemedText type="title" style={styles.heroTitle}>
            Less scattered.{"\n"}
            <ThemedText type="title" style={styles.heroAccent}>
              More understood.
            </ThemedText>
          </ThemedText>

          <ThemedText themeColor="textSecondary" style={styles.heroDescription}>
            Capture what happens in class and turn it into organized material
            you can actually study from.
          </ThemedText>
        </View>

        {/* ───────────────── STUDENT STRIP ───────────────── */}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View student profile"
          onPress={() => setProfileOpen(true)}
          style={({ pressed }) => [
            styles.studentStrip,
            pressed && styles.cardPressed,
          ]}
        >
          <View style={styles.studentInitial}>
            <ThemedText style={styles.studentInitialText}>
              {profile ? getInitials(profile.name) || "·" : "·"}
            </ThemedText>
          </View>

          <View style={styles.studentCopy}>
            <ThemedText style={styles.studentTitle}>
              Your academic workspace
            </ThemedText>

            <ThemedText type="small" themeColor="textSecondary">
              Student profile · Courses · Study progress
            </ThemedText>
          </View>

          <ThemedText style={styles.chevron}>›</ThemedText>
        </Pressable>

        {/* ───────────────── CAPTURE HERO ───────────────── */}

        <View style={styles.captureHero}>
          <View style={styles.heroDecorOne} />
          <View style={styles.heroDecorTwo} />

          <View style={styles.captureHeader}>
            <View style={styles.captureHeaderCopy}>
              <ThemedText style={styles.captureEyebrow}>
                START WITH THE MOMENT
              </ThemedText>

              <ThemedText style={styles.captureHeading}>
                What are we learning?
              </ThemedText>
            </View>

            <StatusBadge label="READY" />
          </View>

          <ScanArtwork compact />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Capture class material"
            accessibilityHint="Take or choose a photo of class material"
            onPress={() => router.push("/capture")}
            style={({ pressed }) => [
              styles.captureButton,
              pressed && styles.capturePressed,
            ]}
          >
            <View style={styles.captureButtonIcon}>
              <ThemedText style={styles.captureButtonIconText}>◎</ThemedText>
            </View>

            <View style={styles.captureButtonCopy}>
              <ThemedText style={styles.captureButtonTitle}>
                Capture your class
              </ThemedText>

              <ThemedText style={styles.captureButtonSubtitle}>
                Photo · Notes · Slides · Whiteboards
              </ThemedText>
            </View>

            <View style={styles.captureArrow}>
              <ThemedText style={styles.captureArrowText}>→</ThemedText>
            </View>
          </Pressable>

          <View style={styles.captureModes}>
            <CaptureMode icon="▣" title="Photo" />
            <CaptureMode icon="◉" title="Audio" muted />
            <CaptureMode icon="↥" title="File" muted />
          </View>
        </View>

        {/* ───────────────── RECENT ───────────────── */}

        {!loading && !error ? (
          <View style={styles.section}>
            <SectionHeader title="Continue studying" detail="Latest lectures" />

            {recentError ? (
              <AppButton
                secondary
                title="Some lectures couldn’t load · Retry"
                onPress={() => setAttempt((value) => value + 1)}
              />
            ) : null}

            {recentLoading ? (
              <EmptyState
                loading
                title="Finding your latest ideas"
                description="Your courses are already available while ClassLens gathers recent lectures."
              />
            ) : recent.length ? (
              recent.map((lecture) => (
                <LectureCard key={lecture.id} lecture={lecture} />
              ))
            ) : !recentError ? (
              <EmptyState
                title="Your next idea starts here"
                description="Capture something from class and ClassLens will organize it into a study-ready lecture."
                action="Capture your first lecture"
                onPress={() => router.push("/capture")}
              />
            ) : null}
          </View>
        ) : null}

        {/* ───────────────── COURSES ───────────────── */}

        <View style={styles.section}>
          <View style={styles.courseHeader}>
            <SectionHeader
              title="Your courses"
              detail={
                loading
                  ? "Loading…"
                  : error
                    ? undefined
                    : `${courses.length} notebooks`
              }
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add course"
              onPress={() => setMenuOpen(true)}
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText style={styles.addButtonText}>＋</ThemedText>
            </Pressable>
          </View>

          {loading ? (
            <EmptyState
              loading
              title="Opening your workspace"
              description="Gathering your courses and lecture notes."
            />
          ) : error ? (
            <EmptyState
              title="Let’s try that again"
              description="Your courses couldn’t be loaded."
              action="Try again"
              onPress={() => setAttempt((value) => value + 1)}
            />
          ) : courses.length ? (
            courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))
          ) : (
            <EmptyState
              title="A fresh notebook"
              description="Add a course and everything you capture for it will stay organized here."
            />
          )}
        </View>

        {/* ───────────────── STUDY PROMO ───────────────── */}

        <View style={styles.studyPanel}>
          <View style={styles.studyMark}>
            <ThemedText style={styles.studyMarkText}>✦</ThemedText>
          </View>

          <View style={styles.studyCopy}>
            <ThemedText style={styles.studyEyebrow}>CLASSLENS STUDY</ThemedText>

            <ThemedText style={styles.studyTitle}>
              Capture it once.{"\n"}Study it differently.
            </ThemedText>

            <ThemedText
              themeColor="textSecondary"
              style={styles.studyDescription}
            >
              Summaries, key concepts, lecture questions and quizzes all begin
              with the material you save.
            </ThemedText>
          </View>
        </View>

        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.footer}
        >
          Made for the way you learn. ✦ ClassLens
        </ThemedText>
      </Screen>

      {/* ───────────────── MENU SHEET ───────────────── */}

      <Modal
        transparent
        visible={menuOpen}
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable
            style={styles.menuSheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.menuBrand}>
              <View style={styles.brandMark}>
                <ThemedText style={styles.brandMarkText}>✦</ThemedText>
              </View>

              <View>
                <ThemedText style={styles.menuTitle}>ClassLens</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Your academic workspace
                </ThemedText>
              </View>
            </View>

            <MenuItem
              title="Capture lecture"
              detail="Photo, notes or slides"
              onPress={() => {
                setMenuOpen(false);
                router.push("/capture");
              }}
            />

            <MenuItem
              title="Courses"
              detail={`${courses.length} available`}
              onPress={() => setMenuOpen(false)}
            />

            <MenuItem
              title="Profile"
              detail="Academic information"
              onPress={() => {
                setMenuOpen(false);
                setProfileOpen(true);
              }}
            />

            <View style={styles.menuDivider} />

            <MenuItem
              title="Add course"
              detail="Find or create a course"
              onPress={() => {
                setMenuOpen(false);
                router.push('/course-onboarding' as never);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ───────────────── PROFILE SHEET ───────────────── */}

      <Modal
        transparent
        visible={profileOpen}
        animationType="fade"
        onRequestClose={() => setProfileOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setProfileOpen(false)}
        >
          <Pressable
            style={styles.profileSheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.profileHeader}>
              <View style={styles.profileAvatar}>
                <ThemedText style={styles.profileAvatarText}>
                    {profile ? getInitials(profile.name) || "·" : "·"}
                  </ThemedText>
              </View>

              <View style={styles.profileHeaderCopy}>
                <ThemedText style={styles.profileTitle}>
                  Student profile
                </ThemedText>

                <ThemedText type="small" themeColor="textSecondary">
                  Personalize ClassLens around your academic journey.
                </ThemedText>
              </View>
            </View>

            <View style={styles.profileField}>
              <ThemedText type="small" themeColor="textSecondary">
                CLASSIFICATION
              </ThemedText>
              <ThemedText style={styles.profileValue}>
                Not selected yet
              </ThemedText>
            </View>

            <View style={styles.profileField}>
              <ThemedText type="small" themeColor="textSecondary">
                MAJOR
              </ThemedText>
              <ThemedText style={styles.profileValue}>Not added yet</ThemedText>
            </View>

            <View style={styles.profileField}>
              <ThemedText type="small" themeColor="textSecondary">
                UNIVERSITY
              </ThemedText>
              <ThemedText style={styles.profileValue}>Not added yet</ThemedText>
            </View>

            <AppButton
              title="Close profile"
              onPress={() => setProfileOpen(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>

    </>
  );
}

function CaptureMode({
  icon,
  title,
  muted = false,
}: {
  icon: string;
  title: string;
  muted?: boolean;
}) {
  return (
    <View style={[styles.modeCard, muted && styles.modeMuted]}>
      <ThemedText style={styles.modeIcon}>{icon}</ThemedText>

      <ThemedText style={styles.modeTitle}>{title}</ThemedText>

      {muted ? (
        <ThemedText style={styles.modeSoon}>NEXT</ThemedText>
      ) : (
        <ThemedText style={styles.modeReady}>READY</ThemedText>
      )}
    </View>
  );
}

function MenuItem({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && styles.cardPressed]}
    >
      <View style={styles.menuItemCopy}>
        <ThemedText style={styles.menuItemTitle}>{title}</ThemedText>

        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>

      <ThemedText style={styles.menuChevron}>›</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EBEEE8",
  },

  menuIcon: {
    color: Brand.ink,
    fontSize: 20,
  },

  pressed: {
    opacity: 0.55,
  },

  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },

  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: Brand.forest,
    alignItems: "center",
    justifyContent: "center",
  },

  brandMarkText: {
    color: Brand.lime,
    fontSize: 14,
  },

  brandName: {
    color: Brand.ink,
    fontSize: 18,
    fontWeight: "700",
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Brand.forest,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  intro: {
    gap: 14,
  },

  eyebrow: {
    color: "#738079",
    fontSize: 11,
    letterSpacing: 1.2,
  },

  heroTitle: {
    fontFamily: Fonts.serif,
    fontWeight: "400",
    letterSpacing: -1.5,
    fontSize: 40,
    lineHeight: 46,
  },

  heroAccent: {
    fontFamily: Fonts.serif,
    fontWeight: "400",
    color: Brand.forest,
  },

  heroDescription: {
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 520,
  },

  studentStrip: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#EBEEE7",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  studentInitial: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#D8E3D4",
    alignItems: "center",
    justifyContent: "center",
  },

  studentInitialText: {
    color: Brand.forest,
    fontSize: 12,
    fontWeight: "800",
  },

  studentCopy: {
    flex: 1,
    gap: 3,
  },

  studentTitle: {
    color: Brand.ink,
    fontSize: 14,
    fontWeight: "700",
  },

  chevron: {
    color: Brand.forest,
    fontSize: 26,
  },

  captureHero: {
    backgroundColor: Brand.forest,
    borderRadius: 28,
    padding: 20,
    gap: 18,
    overflow: "hidden",
    position: "relative",
  },

  heroDecorOne: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -110,
    top: -110,
    backgroundColor: "#2F5A48",
  },

  heroDecorTwo: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    left: -80,
    bottom: -80,
    backgroundColor: "#2A5544",
  },

  captureHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  captureHeaderCopy: {
    flex: 1,
    gap: 5,
  },

  captureEyebrow: {
    color: Brand.lime,
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: "800",
  },

  captureHeading: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
  },

  captureButton: {
    minHeight: 78,
    borderRadius: 20,
    padding: 14,
    backgroundColor: "#F5F5EE",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  capturePressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },

  captureButtonIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E0E9D7",
  },

  captureButtonIconText: {
    color: Brand.forest,
    fontSize: 25,
  },

  captureButtonCopy: {
    flex: 1,
    gap: 3,
  },

  captureButtonTitle: {
    color: Brand.ink,
    fontSize: 16,
    fontWeight: "700",
  },

  captureButtonSubtitle: {
    color: "#748077",
    fontSize: 11,
  },

  captureArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Brand.lime,
  },

  captureArrowText: {
    color: Brand.ink,
    fontSize: 17,
    fontWeight: "700",
  },

  captureModes: {
    flexDirection: "row",
    gap: 8,
  },

  modeCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: 16,
    padding: 10,
    backgroundColor: "#315D4B",
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
  },

  modeMuted: {
    opacity: 0.55,
  },

  modeIcon: {
    color: Brand.lime,
    fontSize: 17,
  },

  modeTitle: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },

  modeReady: {
    color: Brand.lime,
    fontSize: 7,
    letterSpacing: 1,
    fontWeight: "800",
  },

  modeSoon: {
    color: "#B5C7BB",
    fontSize: 7,
    letterSpacing: 1,
    fontWeight: "800",
  },

  section: {
    gap: 16,
  },

  courseHeader: {
    gap: 10,
  },

  addButton: {
    alignSelf: "flex-end",
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: Brand.forest,
    alignItems: "center",
    justifyContent: "center",
  },

  addButtonText: {
    color: Brand.lime,
    fontSize: 21,
  },

  studyPanel: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "#E8EFDE",
    gap: 14,
  },

  studyMark: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: Brand.forest,
    alignItems: "center",
    justifyContent: "center",
  },

  studyMarkText: {
    color: Brand.lime,
    fontSize: 20,
  },

  studyCopy: {
    gap: 6,
  },

  studyEyebrow: {
    color: "#72816F",
    fontSize: 9,
    letterSpacing: 1.3,
    fontWeight: "800",
  },

  studyTitle: {
    color: Brand.ink,
    fontFamily: Fonts.serif,
    fontSize: 26,
    lineHeight: 32,
  },

  studyDescription: {
    fontSize: 13,
    lineHeight: 20,
  },

  footer: {
    textAlign: "center",
    marginTop: 8,
  },

  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(13, 30, 24, 0.42)",
  },

  menuSheet: {
    backgroundColor: "#F7F6F0",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 22,
    paddingBottom: 36,
    gap: 12,
  },

  profileSheet: {
    backgroundColor: "#F7F6F0",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 22,
    paddingBottom: 36,
    gap: 18,
  },

  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#D4D9D1",
    alignSelf: "center",
    marginBottom: 6,
  },

  menuBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 6,
  },

  menuTitle: {
    color: Brand.ink,
    fontSize: 20,
    fontWeight: "700",
  },

  menuItem: {
    minHeight: 66,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#ECEFE8",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  menuItemCopy: {
    flex: 1,
    gap: 3,
  },

  menuItemTitle: {
    color: Brand.ink,
    fontSize: 15,
    fontWeight: "700",
  },

  menuChevron: {
    color: Brand.forest,
    fontSize: 24,
  },

  menuDivider: {
    height: 1,
    backgroundColor: "#E2E5DF",
    marginVertical: 4,
  },

  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: Brand.forest,
    alignItems: "center",
    justifyContent: "center",
  },

  profileAvatarText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },

  profileHeaderCopy: {
    flex: 1,
    gap: 4,
  },

  profileTitle: {
    color: Brand.ink,
    fontSize: 21,
    fontWeight: "700",
  },

  profileField: {
    borderRadius: 18,
    padding: 16,
    gap: 5,
    backgroundColor: "#ECEFE8",
  },

  profileValue: {
    color: Brand.ink,
    fontSize: 16,
    fontWeight: "600",
  },
});
