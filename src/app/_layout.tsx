import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  router,
  useRootNavigationState,
  useSegments,
} from 'expo-router';

import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { StatusBar } from 'expo-status-bar';

import { useTheme } from '@/hooks/use-theme';
import { Brand } from '@/constants/theme';
import { getCurrentUserId, getMyProfile, onAuthChange, onProfileChange } from '@/services/auth';
import { hasEnrolledCourses, onEnrollmentChange } from '@/services/enrollment';

const authRoutes = ['login', 'signup'];

/**
 * Session-based gate: signed out goes to login, signed in without a completed
 * profile goes to onboarding, and everyone else reaches the app. The session is
 * persisted by the Supabase client, so reopening the app does not ask again.
 */
function useAuthGate() {
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const [userId, setUserId] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [hasEnrollment, setHasEnrollment] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolve(id: string | null) {
      if (!id) {
        if (active) {
          setUserId(null);
          setHasProfile(null);
          setHasEnrollment(null);
          setReady(true);
        }
        return;
      }
      let profile = null;
      try {
        profile = await getMyProfile();
      } catch {
        // Treat an unreadable profile as missing so onboarding can retry.
      }
      let enrollment: boolean | null = null;
      if (profile) {
        try {
          enrollment = await hasEnrolledCourses();
        } catch {
          // Keep the gate in its loading state rather than misrouting on a failed read.
        }
      }
      if (active) {
        setUserId(id);
        setHasProfile(profile !== null);
        setHasEnrollment(enrollment);
        setReady(true);
      }
    }

    void getCurrentUserId().then(resolve);

    // Onboarding saves through the service, so re-resolve to release the gate.
    const stopProfileWatch = onProfileChange(() => {
      void getCurrentUserId().then(resolve);
    });
    const stopEnrollmentWatch = onEnrollmentChange(() => {
      void getCurrentUserId().then(resolve);
    });

    let unsubscribe: (() => void) | undefined;
    void onAuthChange((id) => { void resolve(id); }).then((off) => {
      if (active) unsubscribe = off; else off();
    });

    return () => { active = false; stopProfileWatch(); stopEnrollmentWatch(); unsubscribe?.(); };
  }, []);

  useEffect(() => {
    // Routing before the navigator mounts throws, so wait for both.
    if (!ready || !navigationState?.key) return;

    const section: string = segments[0] ?? '';
    const inAuth = authRoutes.includes(section);
    const inOnboarding = section === 'onboarding';
    const inCourseOnboarding = section === 'course-onboarding';

    if (!userId) {
      if (!inAuth) router.replace('/login');
    } else if (hasProfile === false) {
      if (!inOnboarding) router.replace('/onboarding');
    } else if (hasEnrollment === false) {
      if (!inCourseOnboarding) router.replace('/course-onboarding' as never);
    } else if (hasEnrollment === true && (inAuth || inOnboarding || inCourseOnboarding)) {
      router.replace('/');
    }
  }, [ready, userId, hasProfile, hasEnrollment, segments, navigationState?.key]);

  return ready;
}

export default function RootLayout() {
  const theme = useTheme();
  const ready = useAuthGate();
  const dark = theme.background !== Brand.paper;
  const navigationTheme = dark ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider
      value={{
        ...navigationTheme,
        colors: {
          ...navigationTheme.colors,
          background: theme.background,
          card: theme.background,
          text: theme.text,
          primary: theme.text,
        },
      }}
    >
      <StatusBar style={dark ? 'light' : 'dark'} />

      {ready ? null : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
          <ActivityIndicator color={theme.text} accessibilityLabel="Opening ClassLens" />
        </View>
      )}

      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
          headerTitleStyle: {
            fontSize: 16,
            fontWeight: '600',
          },
          contentStyle: {
            backgroundColor: theme.background,
          },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'ClassLens',
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="course-onboarding"
          options={{
            title: 'Choose courses',
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="courses"
          options={{
            title: 'Courses',
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="catchup"
          options={{
            title: 'CatchUp',
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="library"
          options={{
            title: 'CatchUp',
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="profile"
          options={{
            title: 'Profile',
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="course/[id]"
          options={{
            title: 'Course workspace',
          }}
        />

        <Stack.Screen
          name="lecture/[id]"
          options={{
            title: 'Lecture notebook',
          }}
        />

        <Stack.Screen
          name="capture"
          options={{
            title: 'Capture lecture',
          }}
        />

        <Stack.Screen
          name="processing"
          options={{
            title: 'The clarity process',
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
