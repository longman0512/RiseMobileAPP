import notifee, { AndroidImportance, AuthorizationStatus } from '@notifee/react-native';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import type { NativeEventSubscription } from 'react-native';

import {
  ensureAndroidPostNotificationsPermission,
  requestNfcAccess,
  requestNotificationsPermission,
} from './permissions';
import { RiseSession } from '../native/RiseSession';

const IOS_SESSION_NOTIFICATION_ID = 'rise-background-session';
const ANDROID_ALERT_CHANNEL_ID = 'rise_session_alerts';

let keepAliveActive = false;
let lastSessionLabel: string | undefined;
let appStateSubscription: NativeEventSubscription | null = null;

function isAppInForeground(state: AppStateStatus = AppState.currentState): boolean {
  return state === 'active';
}

function iosForegroundPresentation(intrusive: boolean) {
  return {
    badge: false,
    sound: intrusive,
    banner: intrusive,
    list: true,
  };
}

async function ensureIosNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return true;

  await requestNfcAccess();
  const settings = await notifee.requestPermission();
  return (
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
  );
}

async function ensureAndroidAlertChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await notifee.createChannel({
    id: ANDROID_ALERT_CHANNEL_ID,
    name: 'Session alerts',
    importance: AndroidImportance.HIGH,
  });
}

async function startAndroidForegroundService(): Promise<void> {
  if (!RiseSession?.start) {
    throw new Error('RiseSession native module is not linked. Rebuild the Android app.');
  }

  await requestNfcAccess();
  let allowed = await ensureAndroidPostNotificationsPermission();
  if (!allowed) {
    await requestNotificationsPermission();
    allowed = await ensureAndroidPostNotificationsPermission();
  }
  if (!allowed) {
    throw new Error('Notification permission is required to keep Rise running in the background.');
  }

  await RiseSession.start();
}

async function stopAndroidForegroundService(): Promise<void> {
  if (Platform.OS !== 'android' || !RiseSession?.stop) return;
  try {
    await RiseSession.stop();
  } catch {
    // Ignore stop errors during teardown.
  }
}

async function displayIosSessionNotification(
  sessionLabel: string | undefined,
  intrusive: boolean,
): Promise<void> {
  const canNotify = await ensureIosNotificationPermission();
  if (!canNotify) return;

  await notifee.displayNotification({
    id: IOS_SESSION_NOTIFICATION_ID,
    title: 'Rise',
    body: sessionLabel ?? 'Waits for NFC tap',
    ios: {
      foregroundPresentationOptions: iosForegroundPresentation(intrusive),
    },
  });
}

async function cancelIosSessionNotification(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await notifee.cancelNotification(IOS_SESSION_NOTIFICATION_ID);
  } catch {
    // Ignore cancel errors.
  }
}

function ensureAppStateListener(): void {
  if (appStateSubscription) return;

  appStateSubscription = AppState.addEventListener('change', (next) => {
    if (!keepAliveActive) return;
    void applySessionBackgroundMode({
      sessionLabel: lastSessionLabel,
      appInForeground: isAppInForeground(next),
    });
  });
}

function clearAppStateListener(): void {
  appStateSubscription?.remove();
  appStateSubscription = null;
}

async function applySessionBackgroundMode(options: {
  sessionLabel?: string;
  appInForeground: boolean;
}): Promise<void> {
  lastSessionLabel = options.sessionLabel;

  if (Platform.OS === 'android') {
    if (options.appInForeground) {
      await stopAndroidForegroundService();
    } else {
      await startAndroidForegroundService();
    }
  }

  if (Platform.OS === 'ios') {
    if (options.appInForeground) {
      await displayIosSessionNotification(options.sessionLabel, false);
    } else {
      await displayIosSessionNotification(options.sessionLabel, true);
    }
  }
}

async function teardownSessionBackground(): Promise<void> {
  keepAliveActive = false;
  lastSessionLabel = undefined;
  clearAppStateListener();
  await stopAndroidForegroundService();
  await cancelIosSessionNotification();
}

/**
 * Keeps session alive in the background (Android FG service + iOS notification).
 * When the app is foreground: iOS posts silently to Notification Center only;
 * Android FG service is stopped (no shade notification while in-app).
 */
export async function syncSessionBackgroundMode(options: {
  sessionActive: boolean;
  sessionLabel?: string;
  appInForeground: boolean;
}): Promise<void> {
  if (!options.sessionActive) {
    await teardownSessionBackground();
    return;
  }

  keepAliveActive = true;
  ensureAppStateListener();
  await applySessionBackgroundMode(options);
}

/** @deprecated Prefer syncSessionBackgroundMode from BackgroundSessionProvider */
export async function startBackgroundSession(options?: {
  sessionLabel?: string;
}): Promise<void> {
  await syncSessionBackgroundMode({
    sessionActive: true,
    sessionLabel: options?.sessionLabel,
    appInForeground: isAppInForeground(),
  });
}

export async function stopBackgroundSession(): Promise<void> {
  await teardownSessionBackground();
}

export function isBackgroundSessionActive(): boolean {
  return keepAliveActive;
}

/**
 * User-facing alerts (session ended, etc.). Suppressed as banners while app is open;
 * shows normally when backgrounded.
 */
export async function displaySessionAlertNotification(options: {
  id?: string;
  title: string;
  body: string;
}): Promise<void> {
  const intrusive = !isAppInForeground();

  if (Platform.OS === 'android') {
    await ensureAndroidAlertChannel();
  } else {
    const canNotify = await ensureIosNotificationPermission();
    if (!canNotify) return;
  }

  await notifee.displayNotification({
    id: options.id ?? `rise-alert-${Date.now()}`,
    title: options.title,
    body: options.body,
    android: {
      channelId: ANDROID_ALERT_CHANNEL_ID,
      importance: intrusive ? AndroidImportance.HIGH : AndroidImportance.LOW,
      pressAction: { id: 'default' },
      onlyAlertOnce: true,
    },
    ios: {
      foregroundPresentationOptions: iosForegroundPresentation(intrusive),
    },
  });
}
