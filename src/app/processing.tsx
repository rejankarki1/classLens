import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ProcessingCard, processingSteps } from '@/components/ProcessingCard';
import { ThemedText } from '@/components/themed-text';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/ui/Screen';

export default function ProcessingScreen() {
  const [step, setStep] = useState(0);
  useFocusEffect(useCallback(() => {
    setStep(0);
    let current = 0;
    const timer = setInterval(() => {
      current += 1;
      if (current < processingSteps.length) setStep(current);
      else {
        clearInterval(timer);
        router.replace({ pathname: '/lecture/[id]', params: { id: 'binary-search-trees' } });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []));

  return <Screen>
    <ThemedText type="subtitle">Making sense of class</ThemedText>
    <ThemedText themeColor="textSecondary">Demo preview · No AI analysis is running.</ThemedText>
    <ProcessingCard step={step} />
    <ThemedText>Your sample lecture will open in a few seconds.</ThemedText>
    <AppButton title="Cancel" secondary onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
  </Screen>;
}
