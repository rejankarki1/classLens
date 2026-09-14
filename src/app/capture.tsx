import { router } from 'expo-router';
import { useState } from 'react';
import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { Screen } from '@/components/ui/Screen';

export default function CaptureScreen() {
  const [notice, setNotice] = useState('');
  return <Screen>
    <ThemedText type="subtitle">Capture a moment of class</ThemedText>
    <ThemedText themeColor="textSecondary">Turn whiteboards, slides, and worksheets into organized lecture notes.</ThemedText>
    <AppCard>
      <ThemedText>Photo capture is coming soon.</ThemedText>
      <AppButton title="Take Photo" secondary onPress={() => setNotice('Coming soon: camera capture is not available yet.')} />
      <AppButton title="Choose Photo" secondary onPress={() => setNotice('Coming soon: photo selection is not available yet.')} />
      {notice ? <ThemedText accessibilityLiveRegion="polite">{notice}</ThemedText> : null}
    </AppCard>
    <ThemedText>Preview the experience with a sample Binary Search Trees lecture. No photo is uploaded.</ThemedText>
    <AppButton title="Try demo processing" onPress={() => router.push('/processing')} />
  </Screen>;
}
