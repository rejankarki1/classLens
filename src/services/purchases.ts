import { Platform } from 'react-native';

import { getCurrentUserId } from '@/services/auth';

const key = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.trim() ?? '';
let configured = false;
let identity: string | null = null;
let warned = false;
let queue: Promise<void> = Promise.resolve();

function available(): boolean {
  if (Platform.OS === 'ios' && __DEV__ && key) return true;
  if (!warned) {
    warned = true;
    console.warn('RevenueCat is unavailable; ClassLens Pro remains locked. Set EXPO_PUBLIC_REVENUECAT_IOS_KEY in a debug iOS build.');
  }
  return false;
}

/** Serializes auth changes so an old login cannot overwrite a newer logout. */
export function syncPurchaseIdentity(userId: string | null): Promise<void> {
  queue = queue.catch(() => undefined).then(async () => {
    if (!available()) return;
    const { default: Purchases } = await import('react-native-purchases');
    if (!configured) {
      if (!userId) return;
      Purchases.configure({ apiKey: key, appUserID: userId });
      configured = true;
      identity = userId;
      return;
    }
    if (userId === identity) return;
    if (userId) await Purchases.logIn(userId);
    else if (identity) await Purchases.logOut();
    identity = userId;
  });
  return queue;
}

async function ready() {
  if (!available()) return null;
  const userId = await getCurrentUserId();
  if (!userId) return null;
  await syncPurchaseIdentity(userId);
  return (await import('react-native-purchases')).default;
}

export async function hasProEntitlement(): Promise<boolean> {
  try {
    const Purchases = await ready();
    return Purchases ? Boolean((await Purchases.getCustomerInfo()).entitlements.active.pro) : false;
  } catch { return false; }
}

export async function presentProPaywall(): Promise<boolean> {
  const Purchases = await ready();
  if (!Purchases) throw new Error('ClassLens Pro purchases require a configured debug iOS build.');
  const offering = (await Purchases.getOfferings()).current;
  if (!offering) throw new Error('The ClassLens Pro offering is not available yet.');
  const { default: RevenueCatUI } = await import('react-native-purchases-ui');
  await RevenueCatUI.presentPaywall({ offering });
  return hasProEntitlement();
}

export async function restoreProPurchases(): Promise<boolean> {
  const Purchases = await ready();
  if (!Purchases) throw new Error('ClassLens Pro purchases require a configured debug iOS build.');
  return Boolean((await Purchases.restorePurchases()).entitlements.active.pro);
}
