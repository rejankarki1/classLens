import { ActivityIndicator } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { ThemedText } from '@/components/themed-text';

export const processingSteps = ['Reading material...', 'Detecting topic...', 'Matching course...', 'Building summary...'];

export function ProcessingCard({ step }: { step: number }) {
  return <AppCard>
    <ActivityIndicator size="large" color="#2357C6" />
    {processingSteps.map((label, index) => (
      <ThemedText key={label} accessibilityLiveRegion={index === step ? 'polite' : 'none'}
        themeColor={index === step ? 'text' : 'textSecondary'}>
        {index < step ? '✓ ' : index === step ? '• ' : ''}{label}
      </ThemedText>
    ))}
  </AppCard>;
}
