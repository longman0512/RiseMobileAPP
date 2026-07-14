import { Platform } from 'react-native';
import {
  PERMISSIONS,
  RESULTS,
  check,
  checkNotifications,
  request,
  requestNotifications,
  type NotificationOption,
} from 'react-native-permissions';

import Contacts from 'react-native-contacts';

import { initNfc, isNfcEnabled, isNfcSupported, promptNfcSessionOnce } from './nfc';

export async function requestBluetoothPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    const status = await request(PERMISSIONS.IOS.BLUETOOTH);
    return status === RESULTS.GRANTED;
  }

  const connect = await request(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT);
  const scan = await request(PERMISSIONS.ANDROID.BLUETOOTH_SCAN);
  return connect === RESULTS.GRANTED && scan === RESULTS.GRANTED;
}

export async function requestNfcAccess(): Promise<boolean> {
  const supported = await isNfcSupported();
  if (!supported) return false;

  const started = await initNfc();
  if (!started) return false;

  if (Platform.OS === 'android') {
    return isNfcEnabled();
  }

  // iOS doesn't have a simple "permission" prompt for NFC; the system sheet is
  // shown when starting a reader session. We open a short session so the user
  // sees the NFC sheet at the same time we request other permissions.
  await promptNfcSessionOnce();
  return true;
}

export async function requestNotificationsPermission(): Promise<boolean> {
  const notificationOptions: NotificationOption[] | undefined =
    Platform.OS === 'ios' ? ['alert', 'badge', 'sound'] : undefined;

  const { status: existing } = await checkNotifications();
  if (existing === RESULTS.GRANTED || existing === RESULTS.LIMITED) {
    return true;
  }

  const { status } = await requestNotifications(notificationOptions);
  return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
}

/** Requests NFC then notifications (spec onboarding; no Bluetooth). */
export async function requestNfcAndNotifications(): Promise<{
  nfc: boolean;
  notifications: boolean;
}> {
  const nfc = await requestNfcAccess();
  const notifications = await requestNotificationsPermission();
  return { nfc, notifications };
}

/** @deprecated BLE out of scope — use requestNfcAndNotifications */
export async function requestNotificationWithRelatedPermissions(): Promise<{
  bluetooth: boolean;
  nfc: boolean;
  notifications: boolean;
}> {
  const nfc = await requestNfcAccess();
  const notifications = await requestNotificationsPermission();
  return { bluetooth: true, nfc, notifications };
}

/** Uses react-native-contacts (avoids react-native-permissions CONTACTS pod handler). */
export async function requestContactsPermission(): Promise<boolean> {
  try {
    const permission = await Contacts.requestPermission();
    return permission === 'authorized' || permission === 'limited';
  } catch {
    return false;
  }
}

/**
 * Reads the current contacts permission without prompting. Used to tell apart a
 * still-promptable state from a permanently blocked one (iOS only prompts once;
 * after a denial `requestPermission()` returns `denied` silently), so the UI can
 * route the user to system Settings instead of a dead "Try again".
 */
export async function isContactsPermissionBlocked(): Promise<boolean> {
  try {
    const permission = await Contacts.checkPermission();
    return permission === 'denied';
  } catch {
    return false;
  }
}

export async function ensureAndroidPostNotificationsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (typeof Platform.Version === 'number' && Platform.Version < 33) return true;

  const postNotifications = 'android.permission.POST_NOTIFICATIONS' as (typeof PERMISSIONS.ANDROID)[keyof typeof PERMISSIONS.ANDROID];

  const current = await check(postNotifications);
  if (current === RESULTS.GRANTED) return true;

  const result = await request(postNotifications);
  return result === RESULTS.GRANTED;
}
