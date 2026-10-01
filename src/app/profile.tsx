import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';

import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ClassLensLogo } from '@/components/ClassLensLogo';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/Screen';

import { Brand, Fonts } from '@/constants/theme';
import { SUPPORT_EMAIL } from '@/constants/support';

import { getInitials } from '@/features/profile/initials';
import { deleteAccount, getCurrentUserEmail, getMyProfile, signOut } from '@/services/auth';
import { getProcessingNotificationPermission, requestProcessingNotificationPermission, type ProcessingNotificationPermission } from '@/services/processingNotifications';
import { registerDeviceToken } from '@/services/pushTokens';
import { hasProEntitlement, presentProPaywall, restoreProPurchases } from '@/services/purchases';
import type { Profile } from '@/types';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [notifications, setNotifications] = useState<ProcessingNotificationPermission>({ enabled: false, canAskAgain: true });
  const [isPro, setIsPro] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    try {
      const [nextProfile, nextEmail, permission, pro] = await Promise.allSettled([
        getMyProfile(),
        getCurrentUserEmail(),
        getProcessingNotificationPermission(),
        hasProEntitlement(),
      ]);
      if (nextProfile.status === 'fulfilled') setProfile(nextProfile.value);
      if (nextEmail.status === 'fulfilled') setEmail(nextEmail.value ?? '');
      if (permission.status === 'fulfilled') setNotifications(permission.value);
      setIsPro(pro.status === 'fulfilled' && pro.value);
    } finally {
      if (pull) setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function manageNotifications() {
    if (notifications.enabled || !notifications.canAskAgain) {
      await Linking.openSettings();
      return;
    }
    const enabled = await requestProcessingNotificationPermission().catch(() => false);
    const permission = await getProcessingNotificationPermission().catch(() => ({ enabled: false, canAskAgain: false }));
    setNotifications(permission);
    if (enabled) await registerDeviceToken().catch(() => undefined);
    else if (!permission.canAskAgain) await Linking.openSettings();
  }

  async function contactSupport() {
    const subject = encodeURIComponent('ClassLens help & feedback');
    await Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`);
  }

  async function managePro(restore = false) {
    if (purchaseBusy) return;
    setPurchaseBusy(true);
    setPurchaseError('');
    try {
      const active = restore ? await restoreProPurchases() : await presentProPaywall();
      setIsPro(active);
      if (restore && !active) setPurchaseError('No active ClassLens Pro purchase was found.');
    } catch (caught) {
      setPurchaseError(caught instanceof Error ? caught.message : 'Purchases are unavailable. Please try again.');
    } finally { setPurchaseBusy(false); }
  }

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

  async function removeAccount() {
    if (deleteConfirmation !== 'DELETE' || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount();
      // The root layout returns to login after the local session is cleared.
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : 'Your account could not be deleted.');
      setDeleting(false);
    }
  }

  return (
    <Screen showBottomNav refreshing={refreshing} onRefresh={() => void load(true)}>
      <View style={styles.header}>
        <ClassLensLogo compact />
      </View>

      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <ThemedText style={styles.avatarText}>
            {getInitials(profile?.name ?? '') || '·'}
          </ThemedText>
        </View>

        <View style={styles.profileCopy}>
          <ThemedText type="title" style={styles.title}>{profile?.name ?? 'Your profile'}</ThemedText>

          <ThemedText themeColor="textSecondary">{email || 'Signed-in email unavailable'}</ThemedText>
        </View>
      </View>

      <ProfileRow label="CLASSIFICATION" value={profile?.year ?? 'Not selected'} />
      <ProfileRow label="MAJOR" value={profile?.major ?? 'Not added'} />
      <ProfileRow label="MEMBERSHIP" value={isPro ? 'ClassLens Pro ✓' : 'ClassLens Free'} />
      {!isPro ? <SettingRow title={purchaseBusy ? 'Opening Pro…' : 'Upgrade to ClassLens Pro'} onPress={() => void managePro()} /> : null}
      <SettingRow title="Restore Purchases" onPress={() => void managePro(true)} />
      {purchaseError ? <ThemedText accessibilityLiveRegion="polite" style={styles.deleteError}>{purchaseError}</ThemedText> : null}
      <View style={styles.settings}>
        <ThemedText style={styles.sectionTitle}>
          Preferences
        </ThemedText>

        <SettingRow title="Edit profile" onPress={() => router.push('/edit-profile' as never)} />
        <SettingRow title="Manage courses" onPress={() => router.push('/courses' as never)} />
        <SettingRow title="Review missed questions" onPress={() => router.push('/quiz-review' as never)} />
        <SettingRow title="Notifications" value={notifications.enabled ? 'On' : 'Off'} onPress={() => void manageNotifications()} />
        <SettingRow title="Privacy" onPress={() => router.push('/privacy' as never)} />
        <SettingRow title="Help & feedback" onPress={() => void contactSupport()} />

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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          disabled={signingOut || deleting}
          onPress={() => {
            setDeleteConfirmation('');
            setDeleteError('');
            setDeleteOpen(true);
          }}
          style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}
        >
          <ThemedText style={[styles.settingTitle, styles.deleteAccount]}>Delete account</ThemedText>
        </Pressable>
      </View>

      <Modal
        transparent
        visible={deleteOpen}
        animationType="fade"
        onRequestClose={() => { if (!deleting) setDeleteOpen(false); }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.deleteCard}>
            <ThemedText type="title" style={styles.deleteTitle}>Delete your account?</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.deleteBody}>
              This permanently removes your profile, enrollments, notebooks, captures, quiz history, push tokens, and account-owned files. This cannot be undone.
            </ThemedText>
            <ThemedText style={styles.deletePrompt}>Type DELETE to confirm</ThemedText>
            <TextInput
              value={deleteConfirmation}
              onChangeText={setDeleteConfirmation}
              editable={!deleting}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Type DELETE to confirm account deletion"
              style={styles.deleteInput}
            />
            {deleteError ? <ThemedText accessibilityLiveRegion="polite" style={styles.deleteError}>{deleteError}</ThemedText> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: deleteConfirmation !== 'DELETE' || deleting, busy: deleting }}
              disabled={deleteConfirmation !== 'DELETE' || deleting}
              onPress={removeAccount}
              style={({ pressed }) => [styles.deleteButton, (pressed || deleteConfirmation !== 'DELETE' || deleting) && styles.pressed]}
            >
              {deleting ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.deleteButtonText}>Permanently delete account</ThemedText>}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={deleting}
              onPress={() => setDeleteOpen(false)}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            >
              <ThemedText style={styles.cancelText}>Cancel</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  value,
  onPress,
}: {
  title: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingRow,
        pressed && styles.pressed,
      ]}
    >
      <ThemedText style={styles.settingTitle}>
        {title}
      </ThemedText>

      <View style={styles.settingAction}>
        {value ? <ThemedText style={styles.settingValue}>{value}</ThemedText> : null}
        <ThemedText style={styles.chevron}>›</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  signOut: {
    color: '#F3C7C7',
    fontWeight: '700',
  },

  deleteAccount: { color: '#F3C7C7', fontWeight: '800' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(9,23,17,0.66)' },
  deleteCard: { width: '100%', maxWidth: 460, gap: 16, padding: 22, borderRadius: 24, backgroundColor: '#F7F6F0' },
  deleteTitle: { color: Brand.ink, fontFamily: Fonts.serif },
  deleteBody: { lineHeight: 21 },
  deletePrompt: { color: Brand.ink, fontWeight: '800' },
  deleteInput: { minHeight: 52, paddingHorizontal: 15, borderWidth: 1, borderColor: '#CDD4CD', borderRadius: 15, backgroundColor: '#FFFFFF', color: Brand.ink, fontSize: 17, letterSpacing: 2 },
  deleteError: { color: '#8C2F2F', lineHeight: 20 },
  deleteButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#8C2F2F' },
  deleteButtonText: { color: '#FFFFFF', fontWeight: '800' },
  cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: Brand.ink, fontWeight: '700' },

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
    backgroundColor: Brand.forest,
    gap: 6,
  },

  label: {
    letterSpacing: 1,
    color: '#B9CEBF',
  },

  value: {
    color: '#FFFFFF',
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
    backgroundColor: Brand.forest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  settingTitle: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  settingAction: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingValue: { color: Brand.lime, fontSize: 13, fontWeight: '700' },

  chevron: {
    color: Brand.lime,
    fontSize: 25,
  },

  pressed: {
    opacity: 0.55,
  },
});
