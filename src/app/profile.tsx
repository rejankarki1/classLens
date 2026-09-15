import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ClassLensLogo } from '@/components/ClassLensLogo';
import { ThemedText } from '@/components/themed-text';
import { StatusBadge } from '@/components/ui/Editorial';
import { Screen } from '@/components/ui/Screen';

import { Brand, Fonts } from '@/constants/theme';

import { getInitials } from '@/features/profile/initials';
import { getMyProfile, signOut } from '@/services/auth';
import type { Profile } from '@/types';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getMyProfile()
        .then((data) => { if (active) setProfile(data); })
        .catch(() => { if (active) setProfile(null); });
      return () => { active = false; };
    }, [])
  );

  async function leave() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // The root layout returns to login once the session clears.
      await signOut();
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <Screen showBottomNav>
      <View style={styles.header}>
        <ClassLensLogo compact />
        <StatusBadge label="PROFILE" />
      </View>

      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <ThemedText style={styles.avatarText}>
            {getInitials(profile?.name ?? '') || '·'}
          </ThemedText>
        </View>

        <View style={styles.profileCopy}>
          <ThemedText type="title" style={styles.title}>
            Your academic profile
          </ThemedText>

          <ThemedText themeColor="textSecondary">
            Personalize ClassLens around the way you learn.
          </ThemedText>
        </View>
      </View>

      <ProfileRow label="CLASSIFICATION" value={profile?.year ?? 'Not selected'} />
      <ProfileRow label="MAJOR" value={profile?.major ?? 'Not added'} />
      <ProfileRow label="UNIVERSITY" value="Not added" />
      <ProfileRow label="GRADUATION" value="Not added" />

      <View style={styles.settings}>
        <ThemedText style={styles.sectionTitle}>
          Preferences
        </ThemedText>

        <SettingRow title="Edit profile" />
        <SettingRow title="Manage courses" />
        <SettingRow title="Appearance" />
        <SettingRow title="Notifications" />
        <SettingRow title="Privacy" />
        <SettingRow title="Help & feedback" />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          accessibilityState={{ disabled: signingOut, busy: signingOut }}
          disabled={signingOut}
          onPress={leave}
          style={({ pressed }) => [
            styles.settingRow,
            (pressed || signingOut) && styles.pressed,
          ]}
        >
          <ThemedText style={[styles.settingTitle, styles.signOut]}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </ThemedText>
        </Pressable>
      </View>
    </Screen>
  );
}

function ProfileRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.profileRow}>
      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={styles.label}
      >
        {label}
      </ThemedText>

      <ThemedText style={styles.value}>
        {value}
      </ThemedText>
    </View>
  );
}

function SettingRow({
  title,
}: {
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.settingRow,
        pressed && styles.pressed,
      ]}
    >
      <ThemedText style={styles.settingTitle}>
        {title}
      </ThemedText>

      <ThemedText style={styles.chevron}>
        ›
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  signOut: {
    color: '#A14E4E',
    fontWeight: '700',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },

  profileHeader: {
    gap: 16,
  },

  avatar: {
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: Brand.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '800',
  },

  profileCopy: {
    gap: 7,
  },

  title: {
    fontFamily: Fonts.serif,
    fontWeight: '400',
    letterSpacing: -1.2,
  },

  profileRow: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#ECEFE8',
    gap: 6,
  },

  label: {
    letterSpacing: 1,
  },

  value: {
    color: Brand.ink,
    fontSize: 17,
    fontWeight: '600',
  },

  settings: {
    gap: 10,
  },

  sectionTitle: {
    fontFamily: Fonts.serif,
    fontSize: 25,
    lineHeight: 31,
  },

  settingRow: {
    minHeight: 58,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E8E2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  settingTitle: {
    color: Brand.ink,
    fontWeight: '600',
  },

  chevron: {
    color: Brand.forest,
    fontSize: 25,
  },

  pressed: {
    opacity: 0.55,
  },
});
