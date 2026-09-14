import { StyleSheet, View } from 'react-native';

import { ClassLensLogo } from '@/components/ClassLensLogo';
import { ThemedText } from '@/components/themed-text';

import {
  EmptyState,
  StatusBadge,
} from '@/components/ui/Editorial';

import { Screen } from '@/components/ui/Screen';

import { Fonts } from '@/constants/theme';

export default function LibraryScreen() {
  return (
    <Screen showBottomNav>
      <View style={styles.header}>
        <ClassLensLogo compact />
        <StatusBadge label="LIBRARY" />
      </View>

      <View style={styles.intro}>
        <ThemedText type="title" style={styles.title}>
          Your knowledge library.
        </ThemedText>

        <ThemedText themeColor="textSecondary">
          Everything ClassLens helps you organize will be searchable here.
        </ThemedText>
      </View>

      <EmptyState
        title="Your library is getting ready"
        description="Captured lectures, files, recordings and generated study notes will live here."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },

  intro: {
    gap: 12,
  },

  title: {
    fontFamily: Fonts.serif,
    fontWeight: '400',
    letterSpacing: -1.2,
  },
});
