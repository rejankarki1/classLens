import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import {
  router,
  usePathname,
} from 'expo-router';

import {
  useRef,
  useState,
  type ComponentType,
} from 'react';

import * as Haptics from 'expo-haptics';

import Svg, { Circle } from 'react-native-svg';

import {
  CaptureMode,
  CaptureModeSheet,
} from '@/components/CaptureModeSheet';

import { BookIcon, HomeIcon, PeopleIcon, PersonIcon } from '@/components/icons/NavIcons';
import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/theme';
import { useCaptureImportLauncher } from '@/features/capture/useCaptureImportLauncher';

type MainRoute =
  | '/'
  | '/courses'
  | '/catchup'
  | '/profile';

const ACTIVE_COLOR = Brand.lime;
const INACTIVE_COLOR = '#8C9791';

const HOLD_TIME = 500;

export function AppBottomNav() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const longPressTriggered = useRef(false);
  const launchCaptureImport = useCaptureImportLauncher();

  function handlePressIn() {
    longPressTriggered.current = false;
  }

  function handleLongPress() {
    longPressTriggered.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetOpen(true);
  }

  function handlePress() {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }

    router.push({
      pathname: '/capture',
      params: {
        source: 'camera',
      },
    });
  }

  function chooseMode(mode: CaptureMode) {
    longPressTriggered.current = false;
    setSheetOpen(false);

    if (mode === 'photo') {
      void launchCaptureImport();
      return;
    }

    router.push({ pathname: '/capture', params: { source: 'camera' } });
  }

  return (
    <>
      <View style={styles.wrapper}>
        <View style={styles.nav}>
          <NavItem icon={HomeIcon} label="Home" route="/" />
          <NavItem icon={BookIcon} label="Courses" route="/courses" />

          <View style={styles.centerSpace} />

          <NavItem icon={PeopleIcon} label="CatchUp" route="/catchup" />
          <NavItem icon={PersonIcon} label="Profile" route="/profile" />

          <View style={styles.capturePosition}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ClassLens capture"
              accessibilityHint="Tap for camera capture. Hold for more capture options."
              delayLongPress={HOLD_TIME}
              onPressIn={handlePressIn}
              onLongPress={handleLongPress}
              onPress={handlePress}
              hitSlop={24}
              pressRetentionOffset={{
                top: 100,
                bottom: 100,
                left: 100,
                right: 100,
              }}
              style={({ pressed }) => [
                styles.capture,
                pressed && styles.capturePressed,
              ]}
            >
              <Svg
                width="54"
                height="54"
                viewBox="0 0 512 512"
              >
                <Circle
                  cx="256"
                  cy="210"
                  r="145"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="34"
                />

                <Circle
                  cx="256"
                  cy="210"
                  r="98"
                  fill="none"
                  stroke="#C4A66A"
                  strokeWidth="28"
                />

                <Circle
                  cx="256"
                  cy="210"
                  r="50"
                  fill="#FFFFFF"
                />

                <Circle
                  cx="256"
                  cy="210"
                  r="25"
                  fill="#4A7C59"
                />

                <Circle
                  cx="256"
                  cy="42"
                  r="17"
                  fill="#C4A66A"
                />
              </Svg>
            </Pressable>
          </View>
        </View>

        <ThemedText
          allowFontScaling={false}
          style={styles.hint}
        >
          Tap camera · Hold for more
        </ThemedText>
      </View>

      <CaptureModeSheet
        visible={sheetOpen}
        onClose={() => {
          longPressTriggered.current = false;
          setSheetOpen(false);
        }}
        onSelect={chooseMode}
      />
    </>
  );
}

function NavItem({
  icon: Icon,
  label,
  route,
}: {
  icon: ComponentType<{ color: string; size?: number }>;
  label: string;
  route: MainRoute;
}) {
  const pathname = usePathname();

  const active =
    route === '/'
      ? pathname === '/'
      : pathname.startsWith(route);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={() => router.replace(route as any)}
      style={({ pressed }) => [
        styles.item,
        pressed && styles.itemPressed,
      ]}
    >
      <Icon color={active ? ACTIVE_COLOR : INACTIVE_COLOR} size={22} />

      <ThemedText
        allowFontScaling={false}
        style={[
          styles.label,
          active && styles.active,
        ]}
      >
        {label}
      </ThemedText>

      {active ? <View style={styles.activeDot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 14,
    paddingBottom: 7,
    backgroundColor: Brand.ink,
  },

  nav: {
    height: 78,
    borderRadius: 27,
    backgroundColor: '#1B3B2D',
    borderWidth: 1,
    borderColor: '#2F4C3E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 7,
    position: 'relative',
    boxShadow: '0px 8px 20px rgba(0,0,0,0.28)',
  },

  item: {
    width: 58,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    position: 'relative',
  },

  itemPressed: {
    opacity: 0.5,
    transform: [{ scale: 0.94 }],
  },

  label: {
    color: INACTIVE_COLOR,
    fontSize: 10,
    fontWeight: '600',
  },

  active: {
    color: ACTIVE_COLOR,
  },

  activeDot: {
    position: 'absolute',
    bottom: 0,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#C4A66A',
  },

  centerSpace: {
    width: 78,
  },

  capturePosition: {
    position: 'absolute',
    left: '50%',
    marginLeft: -40,
    top: -32,
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },

  capture: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#4A7C59',
    borderWidth: 5,
    borderColor: Brand.ink,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 7px 14px rgba(74,124,89,0.3)',
  },

  capturePressed: {
    transform: [{ scale: 0.9 }],
    opacity: 0.9,
    borderColor: '#C4A66A',
  },

  hint: {
    alignSelf: 'center',
    marginTop: 3,
    color: '#93A098',
    fontSize: 8,
    fontWeight: '600',
  },
});
