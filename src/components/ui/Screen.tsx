import { useHeaderHeight } from 'expo-router/react-navigation';
import type {
  PropsWithChildren,
  ReactNode,
} from 'react';

import {
  KeyboardAvoidingView,
  Platform,
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
  /** Keep scrollable forms above the keyboard without changing other screens. */
  avoidKeyboard?: boolean;
  showBottomNav?: boolean;
  /**
   * Opt in on screens that already show a native header. The header consumes
   * the top inset, so applying it again here doubles the space above the first
   * element. Off by default, so no existing screen moves.
   */
  headerAbove?: boolean;
}>;

export function Screen({
  children,
  footer,
  avoidKeyboard = false,
  showBottomNav = false,
  headerAbove = false,
}: Props) {
  const theme = useTheme();
  const headerHeight = useHeaderHeight();

  const content = (
    <SafeAreaView
      edges={headerAbove ? ['left', 'right', 'bottom'] : ['top', 'left', 'right', 'bottom']}
      style={[
        styles.safe,
        {
          backgroundColor: theme.background,
        },
      ]}
    >
      <ScrollView
        style={avoidKeyboard && styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            // SafeAreaView already handles the iPhone notch /
            // Dynamic Island. This is only intentional visual spacing.
            paddingTop: 10,
          },
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

  return avoidKeyboard ? (
    <KeyboardAvoidingView
      style={styles.safe}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      {content}
    </KeyboardAvoidingView>
  ) : content;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },

  scroll: { flex: 1 },

  content: { paddingHorizontal: 24,
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
