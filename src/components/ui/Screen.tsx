import type {
  PropsWithChildren,
  ReactNode,
} from 'react';

import {
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBottomNav } from '@/components/AppBottomNav';
import { MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = PropsWithChildren<{
  footer?: ReactNode;
  showBottomNav?: boolean;
}>;

export function Screen({
  children,
  footer,
  showBottomNav = false,
}: Props) {
  const theme = useTheme();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={[
        styles.safe,
        {
          backgroundColor: theme.background,
        },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          showBottomNav && styles.contentWithNav,
        ]}
      >
        {children}
      </ScrollView>

      {footer ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.background,
            },
          ]}
        >
          {footer}
        </View>
      ) : null}

      {showBottomNav ? <AppBottomNav /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },

  content: { paddingHorizontal: 24, paddingTop: 18,
    paddingBottom: 40,
    gap: 24,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexGrow: 1,
  },

  contentWithNav: {
    paddingBottom: 60,
  },

  footer: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
