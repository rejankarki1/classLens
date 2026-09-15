import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/Screen';
import { Brand, Fonts } from '@/constants/theme';

export default function ProcessingScreen() {
  const params = useLocalSearchParams<{
    imageUri?: string | string[];
    imageUris?: string | string[];
    mode?: string;
    courseId?: string;
  }>();

  const assets = useMemo(() => {
    const raw = params.imageUris ?? params.imageUri;

    if (!raw) return [];

    const values = Array.isArray(raw) ? raw : [raw];

    return values
      .flatMap((value) => {
        try {
          const parsed = JSON.parse(value);

          if (Array.isArray(parsed)) {
            return parsed.filter(
              (item): item is string => typeof item === 'string'
            );
          }
        } catch {
          // A normal Expo file URI is expected here.
        }

        return [value];
      })
      .filter(Boolean);
  }, [params.imageUri, params.imageUris]);

  const count = assets.length;
  const hasMaterial = count > 0 || Boolean(params.mode);

  function retry() {
    router.replace('/capture');
  }

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.header}>
          <ThemedText type="smallBold" style={styles.eyebrow}>
            CLASSLENS INTELLIGENCE
          </ThemedText>

          <ThemedText type="title" style={styles.title}>
            {hasMaterial
              ? 'Your lecture is ready to be understood.'
              : 'No lecture material found.'}
          </ThemedText>

          <ThemedText
            themeColor="textSecondary"
            style={styles.subtitle}
          >
            {hasMaterial
              ? 'ClassLens will turn your actual class material into a structured notebook — never a generic sample.'
              : 'Choose a photo, slide, recording, or file and try again.'}
          </ThemedText>
        </View>

        {assets.length > 0 ? (
          <View style={styles.previewSection}>
            <View style={styles.previewHeader}>
              <ThemedText type="smallBold">
                {count === 1
                  ? 'LECTURE PAGE'
                  : `${count} LECTURE PAGES`}
              </ThemedText>

              <View style={styles.readyBadge}>
                <View style={styles.readyDot} />
                <ThemedText style={styles.readyText}>
                  Ready
                </ThemedText>
              </View>
            </View>

            <View style={styles.previewRow}>
              {assets.slice(0, 3).map((uri, index) => (
                <View
                  key={`${uri}-${index}`}
                  style={styles.previewCard}
                >
                  <Image
                    source={{ uri }}
                    style={styles.previewImage}
                    resizeMode="cover"
                  />

                  <View style={styles.pageBadge}>
                    <ThemedText style={styles.pageBadgeText}>
                      {index + 1}
                    </ThemedText>
                  </View>
                </View>
              ))}

              {count > 3 ? (
                <View style={[styles.previewCard, styles.moreCard]}>
                  <ThemedText style={styles.moreNumber}>
                    +{count - 3}
                  </ThemedText>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                  >
                    more
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {hasMaterial ? (
          <View style={styles.analysisCard}>
            <View style={styles.iconShell}>
              <ActivityIndicator
                size="small"
                color={Brand.forest}
              />
            </View>

            <View style={styles.analysisCopy}>
              <ThemedText type="subtitle">
                Analysis connection pending
              </ThemedText>

              <ThemedText
                themeColor="textSecondary"
                style={styles.body}
              >
                Your material has been captured correctly. The
                frontend is waiting for the lecture-analysis service
                to return notes generated from this exact material.
              </ThemedText>
            </View>
          </View>
        ) : null}

        <View style={styles.promiseCard}>
          <ThemedText type="smallBold" style={styles.promiseLabel}>
            CLASSLENS PROMISE
          </ThemedText>

          <ThemedText style={styles.promiseTitle}>
            Your notes should come from your lecture.
          </ThemedText>

          <ThemedText
            themeColor="textSecondary"
            style={styles.body}
          >
            ClassLens will not substitute Binary Search Trees,
            sample notes, or unrelated academic content when analysis
            is unavailable.
          </ThemedText>
        </View>

        <View style={styles.steps}>
          <Step
            number="01"
            title="Capture"
            description="Your original class material"
            active
          />
          <Step
            number="02"
            title="Understand"
            description="Vision + lecture analysis"
          />
          <Step
            number="03"
            title="Notebook"
            description="Notes, slides, quiz and Q&A"
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
          >
            <ThemedText style={styles.primaryButtonText}>
              {hasMaterial
                ? 'Choose different material'
                : 'Return to capture'}
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
          >
            <ThemedText style={styles.secondaryButtonText}>
              Go back
            </ThemedText>
          </Pressable>
        </View>

        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.footer}
        >
          Actual material in. Actual understanding out. ✦
        </ThemedText>
      </View>
    </Screen>
  );
}

function Step({
  number,
  title,
  description,
  active = false,
}: {
  number: string;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <View style={styles.step}>
      <View
        style={[
          styles.stepNumber,
          active && styles.stepNumberActive,
        ]}
      >
        <ThemedText
          style={[
            styles.stepNumberText,
            active && styles.stepNumberTextActive,
          ]}
        >
          {number}
        </ThemedText>
      </View>

      <View style={styles.stepCopy}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText
          type="small"
          themeColor="textSecondary"
        >
          {description}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    gap: 24,
    paddingBottom: 28,
  },

  header: {
    width: '100%',
    gap: 12,
  },

  eyebrow: {
    color: Brand.forest,
    fontSize: 11,
    letterSpacing: 1.5,
  },

  title: {
    fontFamily: Fonts.serif,
    fontWeight: '400',
    letterSpacing: -1.2,
    lineHeight: 46,
  },

  subtitle: {
    maxWidth: 520,
    fontSize: 15,
    lineHeight: 23,
  },

  previewSection: {
    gap: 12,
  },

  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EAF2E8',
  },

  readyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Brand.forest,
  },

  readyText: {
    color: Brand.forest,
    fontSize: 11,
    fontWeight: '700',
  },

  previewRow: {
    flexDirection: 'row',
    gap: 10,
  },

  previewCard: {
    flex: 1,
    minWidth: 0,
    height: 150,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#E9EDE7',
    borderWidth: 1,
    borderColor: '#DDE3DC',
  },

  previewImage: {
    width: '100%',
    height: '100%',
  },

  pageBadge: {
    position: 'absolute',
    left: 9,
    bottom: 9,
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: 'rgba(24, 49, 37, 0.88)',
  },

  pageBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  moreCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },

  moreNumber: {
    color: Brand.forest,
    fontSize: 22,
    fontWeight: '700',
  },

  analysisCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#F2F5EF',
    borderWidth: 1,
    borderColor: '#DDE5DA',
  },

  iconShell: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },

  analysisCopy: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },

  body: {
    fontSize: 14,
    lineHeight: 22,
  },

  promiseCard: {
    gap: 8,
    padding: 20,
    borderRadius: 22,
    backgroundColor: Brand.forest,
  },

  promiseLabel: {
    color: '#C4A66A',
    fontSize: 10,
    letterSpacing: 1.4,
  },

  promiseTitle: {
    color: '#FFFFFF',
    fontFamily: Fonts.serif,
    fontSize: 23,
    lineHeight: 30,
  },

  steps: {
    gap: 10,
  },

  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 5,
  },

  stepNumber: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#EEF0EC',
  },

  stepNumberActive: {
    backgroundColor: Brand.forest,
  },

  stepNumberText: {
    color: '#778078',
    fontSize: 10,
    fontWeight: '700',
  },

  stepNumberTextActive: {
    color: '#FFFFFF',
  },

  stepCopy: {
    flex: 1,
    gap: 2,
  },

  actions: {
    gap: 10,
  },

  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 17,
    backgroundColor: Brand.forest,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  secondaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#D8DED7',
  },

  secondaryButtonText: {
    color: Brand.forest,
    fontWeight: '600',
  },

  pressed: {
    opacity: 0.75,
  },

  footer: {
    textAlign: 'center',
    paddingTop: 4,
  },
});
