import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Fonts } from '@/constants/theme';

export type CaptureMode =
  | 'photo'
  | 'video'
  | 'audio'
  | 'file';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (mode: CaptureMode) => void;
};

export function CaptureModeSheet({
  visible,
  onClose,
  onSelect,
}: Props) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
      >
        <Pressable
          style={styles.sheet}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.handle} />

          <ThemedText style={styles.eyebrow}>
            CLASSLENS CAPTURE
          </ThemedText>

          <ThemedText style={styles.title}>
            Add something from class.
          </ThemedText>

          <ThemedText
            themeColor="textSecondary"
            style={styles.description}
          >
            Choose how you want to bring your class material into ClassLens.
          </ThemedText>

          <View style={styles.grid}>
            <CaptureTile
              icon="◎"
              title="Photo"
              detail="Slides, notes & whiteboards"
              onPress={() => onSelect('photo')}
            />

          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancel,
              pressed && styles.pressed,
            ]}
          >
            <ThemedText style={styles.cancelText}>
              Cancel
            </ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CaptureTile({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: string;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        pressed && styles.tilePressed,
      ]}
    >
      <View style={styles.iconCircle}>
        <ThemedText style={styles.icon}>
          {icon}
        </ThemedText>
      </View>

      <ThemedText style={styles.tileTitle}>
        {title}
      </ThemedText>

      <ThemedText
        type="small"
        themeColor="textSecondary"
      >
        {detail}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(9,23,17,0.66)',
  },

  sheet: {
    backgroundColor: '#F7F6F0',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 20,
  },

  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#CDD4CD',
    alignSelf: 'center',
  },

  eyebrow: {
    color: '#708479',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  title: {
    fontFamily: Fonts.serif,
    color: Brand.ink,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -1,
  },

  description: {
    fontSize: 14,
    lineHeight: 21,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  tile: {
    width: '48%',
    minHeight: 160,
    padding: 16,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E6DF',
    justifyContent: 'center',
    gap: 8,
  },

  tilePressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },

  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#4A7C59',
    alignItems: 'center',
    justifyContent: 'center',
  },

  icon: {
    color: '#C4A66A',
    fontSize: 24,
  },

  tileTitle: {
    color: Brand.ink,
    fontSize: 18,
    fontWeight: '700',
  },

  cancel: {
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: '#E8EDE7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelText: {
    color: Brand.ink,
    fontWeight: '700',
  },

  pressed: {
    opacity: 0.55,
  },
});
