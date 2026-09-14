import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { Brand } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';

export const processingSteps = ['Reading material', 'Detecting topic', 'Matching course', 'Finding key concepts', 'Building summary'];
const processingDescriptions = ['Making room for every detail.', 'Connecting the central ideas.', 'Finding where this knowledge belongs.', 'Separating the signal from the noise.', 'Putting it all into perspective.'];

interface Props {
  step: number;
  /** Real pipeline stages override the demo labels; the layout is unchanged. */
  steps?: readonly string[];
  descriptions?: readonly string[];
  caption?: string;
  completeTitle?: string;
  completeDescription?: string;
}

export function ProcessingCard({
  step,
  steps = processingSteps,
  descriptions = processingDescriptions,
  caption = 'DEMO PREVIEW',
  completeTitle = 'A clearer picture.',
  completeDescription = 'Your sample notebook is ready to explore.',
}: Props) {
  const theme = useTheme();
  const [pulse] = useState(() => new Animated.Value(1));
  const complete = step >= steps.length;
  useEffect(() => {
    let mounted = true;
    let animation: Animated.CompositeAnimation | undefined;
    const update = (reduced: boolean) => {
      animation?.stop();
      pulse.setValue(1);
      if (!reduced && mounted && !complete) {
        animation = Animated.loop(Animated.sequence([
          Animated.timing(pulse, { toValue: 0.55, duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]));
        animation.start();
      }
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) update(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => { mounted = false; animation?.stop(); subscription.remove(); };
  }, [pulse, complete]);
  const percent = Math.round(Math.min(step, steps.length) / steps.length * 100);
  return <>
    <View style={styles.hero}>
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.orbit}><View style={styles.innerOrbit}><Animated.View style={[styles.lens, { opacity: pulse }]}><ThemedText allowFontScaling={false} style={styles.star}>✦</ThemedText></Animated.View></View></View>
      <ThemedText style={styles.kicker}>CLASSROOM → CLARITY</ThemedText>
      <ThemedText style={styles.heroTitle} accessibilityLiveRegion="polite">{complete ? completeTitle : steps[step]}</ThemedText>
      <ThemedText style={styles.description}>{complete ? completeDescription : descriptions[step]}</ThemedText>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }} accessibilityLabel="Demo progress"><View style={[styles.fill, { width: `${percent}%` }]} /></View>
      <ThemedText style={styles.progressLabel}>{complete ? 'COMPLETE' : `STEP ${step + 1} OF ${steps.length}`}  ·  {caption}</ThemedText>
    </View>
    <View style={styles.steps}>{steps.map((label, index) => {
      const done = index < step;
      const active = index === step;
      return <View key={label} accessible accessibilityLabel={`${label}. ${done ? 'Complete' : active ? 'In progress' : 'Up next'}`} style={[styles.step, { backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement }]}>
        <View style={[styles.number, { backgroundColor: done || active ? Brand.forest : theme.backgroundSelected }]}><ThemedText style={{ color: done || active ? '#FFFFFF' : theme.text, fontSize: 12 }}>{done ? '✓' : String(index + 1).padStart(2, '0')}</ThemedText></View>
        <View style={styles.stepText}><ThemedText style={{ fontWeight: active ? '600' : '400' }}>{label}</ThemedText><ThemedText type="small" themeColor="textSecondary">{done ? 'Complete' : active ? 'In progress' : 'Up next'}</ThemedText></View>
      </View>;
    })}</View>
  </>;
}
const styles = StyleSheet.create({
  hero: { backgroundColor: Brand.forest, borderRadius: 24, padding: 24, alignItems: 'center', gap: 16 },
  orbit: { width: 160, height: 160, borderWidth: 1, borderColor: '#63806B', borderRadius: 80, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  innerOrbit: { width: 120, height: 120, borderWidth: 1, borderColor: '#7D9A72', borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  lens: { width: 80, height: 80, borderRadius: 24, backgroundColor: Brand.lime, alignItems: 'center', justifyContent: 'center' },
  star: { color: Brand.ink, fontSize: 40, lineHeight: 48 },
  kicker: { color: Brand.lime, fontSize: 12, letterSpacing: 1, textAlign: 'center' },
  heroTitle: { color: '#FFFFFF', fontSize: 26, lineHeight: 32, textAlign: 'center', fontWeight: '500' },
  description: { color: '#D5E0D2', textAlign: 'center', fontSize: 14, lineHeight: 24 },
  track: { height: 4, backgroundColor: '#58745D', width: '100%', borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  fill: { height: 4, backgroundColor: Brand.lime },
  progressLabel: { color: '#D5E0D2', fontSize: 12, letterSpacing: 1, textAlign: 'center' },
  steps: { gap: 8 }, step: { padding: 16, flexDirection: 'row', gap: 16, alignItems: 'center', borderRadius: 16 },
  number: { minWidth: 32, minHeight: 32, padding: 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, stepText: { flex: 1, gap: 4 },
});
