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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolve(id: string | null) {
      if (!id) {
        if (active) {
          setUserId(null);
          setHasProfile(null);
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
      if (active) {
        setUserId(id);
        setHasProfile(profile !== null);
        setReady(true);
      }
    }

    void getCurrentUserId().then(resolve);

    // Onboarding saves through the service, so re-resolve to release the gate.
    const stopProfileWatch = onProfileChange(() => {
      void getCurrentUserId().then(resolve);
    });

    let unsubscribe: (() => void) | undefined;
    void onAuthChange((id) => { void resolve(id); }).then((off) => {
      if (active) unsubscribe = off; else off();
    });

    return () => { active = false; stopProfileWatch(); unsubscribe?.(); };
  }, []);

  useEffect(() => {
    // Routing before the navigator mounts throws, so wait for both.
    if (!ready || !navigationState?.key) return;

    const section = segments[0] ?? '';
    const inAuth = authRoutes.includes(section);
    const inOnboarding = section === 'onboarding';

    if (!userId) {
      if (!inAuth) router.replace('/login');
    } else if (hasProfile === false) {
      if (!inOnboarding) router.replace('/onboarding');
    } else if (inAuth || inOnboarding) {
      router.replace('/');
    }
  }, [ready, userId, hasProfile, segments, navigationState?.key]);

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
