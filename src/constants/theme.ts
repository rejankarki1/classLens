/** ClassLens paper-and-ink palette with native and web system font fallbacks. */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#192D27',
    background: '#F6F5EF',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E7EDE3',
    textSecondary: '#647068',
  },
  dark: {
    text: '#EDF1E8',
    background: '#111C18',
    backgroundElement: '#1B2A23',
    backgroundSelected: '#304236',
    textSecondary: '#B1BDB2',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'system-ui, sans-serif',
    serif: 'Georgia, serif',
    rounded: 'system-ui, sans-serif',
    mono: 'monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 640;

export const Brand = { forest: '#234E3C', lime: '#D5EF92', paper: '#F6F5EF', ink: '#192D27', muted: '#B9CEBF' } as const;
