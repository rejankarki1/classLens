import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'ClassLens' }} />
        <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
        <Stack.Screen name="lecture/[id]" options={{ title: 'Lecture' }} />
        <Stack.Screen name="capture" options={{ title: 'Capture' }} />
        <Stack.Screen name="processing" options={{ title: 'Processing' }} />
      </Stack>
    </ThemeProvider>
  );
}
