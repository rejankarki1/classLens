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
} from 'react';

import Svg, { Circle } from 'react-native-svg';

import {
  CaptureMode,
  CaptureModeSheet,
} from '@/components/CaptureModeSheet';

import { ThemedText } from '@/components/themed-text';

type MainRoute =
  | '/'
  | '/courses'
  | '/catchup'
  | '/profile';

const HOLD_TIME = 1000;

export function AppBottomNav() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const longPressTriggered = useRef(false);

  function handlePressIn() {
    longPressTriggered.current = false;
  }

  function handleLongPress() {
    longPressTriggered.current = true;
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
        mode: 'photo',
        autoOpen: 'camera',
      },
    });
  }

  function chooseMode(mode: CaptureMode) {
    longPressTriggered.current = false;
    setSheetOpen(false);

    router.push({
      pathname: '/capture',
      params: {
        mode,
        autoOpen: mode === 'photo' ? 'camera' : undefined,
      },
    });
  }

  return (
    <>
      <View style={styles.wrapper}>
        <View style={styles.nav}>
          <NavItem icon="🏠" label="Home" route="/" />
          <NavItem icon="📚" label="Courses" route="/courses" />

          <View style={styles.centerSpace} />

          <NavItem icon="🔄" label="CatchUp" route="/catchup" />
          <NavItem icon="👤" label="Profile" route="/profile" />

          <View style={styles.capturePosition}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ClassLens capture"
              accessibilityHint="Tap for photo capture. Hold for one second for photo, video, audio and file options."
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
          Tap camera · Hold 1s for more
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
  icon,
  label,
  route,
}: {
  icon: string;
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
      <ThemedText
        allowFontScaling={false}
        style={[
          styles.icon,
          active && styles.active,
        ]}
      >
        {icon}
      </ThemedText>

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
    backgroundColor: '#F7F6F0',
  },

  nav: {
    height: 78,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E5DE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 7,
    position: 'relative',
    shadowColor: '#13271F',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 10,
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

  icon: {
    color: '#8C9791',
    fontSize: 23,
    lineHeight: 28,
  },

  label: {
    color: '#8C9791',
    fontSize: 10,
    fontWeight: '600',
  },

  active: {
    color: '#4A7C59',
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
    borderColor: '#F7F6F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4A7C59',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    elevation: 14,
  },

  capturePressed: {
    transform: [{ scale: 0.9 }],
    opacity: 0.9,
    borderColor: '#C4A66A',
  },

  hint: {
    alignSelf: 'center',
    marginTop: 3,
    color: '#829087',
    fontSize: 8,
    fontWeight: '600',
  },
});
