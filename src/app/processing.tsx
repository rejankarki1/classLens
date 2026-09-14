import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ProcessingCard, processingSteps } from '@/components/ProcessingCard';
import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/Editorial';

export default function ProcessingScreen() {
  const [step, setStep] = useState(0);
  useFocusEffect(useCallback(() => {
    setStep(0);
    let current = 0;
    const timer = setInterval(() => {
      current += 1;
      if (current <= processingSteps.length) setStep(current);
      else {
        clearInterval(timer);
        router.replace({ pathname: '/lecture/[id]', params: { id: 'binary-search-trees' } });
      }
    }, 1400);
    return () => clearInterval(timer);
  }, []));

  return <Screen footer={<AppButton title="Cancel demo" secondary onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />}>
    <StatusBadge label="02 / UNDERSTAND" />
    <ThemedText type="subtitle">A little order. A lot of possibility.</ThemedText>
    <ThemedText themeColor="textSecondary">See how class material becomes an organized notebook. This is a timed demo, not live AI analysis.</ThemedText>
    <ProcessingCard step={step} />
    <ThemedText>Next up: your sample Binary Search Trees notebook.</ThemedText>
  </Screen>;
}
