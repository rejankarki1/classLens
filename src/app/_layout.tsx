import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
} from 'expo-router';

import { StatusBar } from 'expo-status-bar';

import { useTheme } from '@/hooks/use-theme';
import { Brand } from '@/constants/theme';

export default function RootLayout() {
  const theme = useTheme();
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
