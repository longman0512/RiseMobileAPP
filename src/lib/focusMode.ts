import { Alert, Platform } from 'react-native';

import { openFocusSettings } from './focusSettings';
import {
  activateNativeFocusMode,
  deactivateNativeFocusMode,
  hasNativeFocusSelection,
  isNativeFocusAuthorized,
  presentNativeFocusPicker,
  requestNativeFocusAuthorization,
} from '../native/RiseFocusMode';
import type { CoinType } from '../types/coins';
import { COIN_LABELS } from '../types/coins';

/**
 * Try native Focus activation (Phase 2 stub). The Settings reminder alert is
 * intentionally NOT shown at session start anymore: it interrupted the
 * tap-coin -> start flow with an "Open Focus settings / Continue" dialog. Focus
 * is configured during onboarding (FocusSetupScreen) / Settings instead.
 */
export async function activateFocusModeOnSessionStart(protocol: CoinType): Promise<void> {
  await activateNativeFocusMode(protocol);
}

/** RESET has no app blocking; entering it should clear any active shields. */
export async function syncFocusModeForProtocol(protocol: CoinType): Promise<void> {
  if (protocol === 'reset') {
    await deactivateNativeFocusMode();
    return;
  }
  await activateNativeFocusMode(protocol);
}

export async function deactivateFocusModeOnSessionEnd(): Promise<void> {
  await deactivateNativeFocusMode();
}

export async function requestFocusModeAuthorization(): Promise<boolean> {
  return requestNativeFocusAuthorization();
}

export async function isFocusModeAuthorized(): Promise<boolean> {
  return isNativeFocusAuthorized();
}

export async function presentFocusModePicker(protocol: CoinType): Promise<boolean> {
  return presentNativeFocusPicker(protocol);
}

export async function hasFocusModeSelection(protocol: CoinType): Promise<boolean> {
  return hasNativeFocusSelection(protocol);
}

function getIosMajorVersion(): number | null {
  const version = Platform.Version;
  if (typeof version === 'number') return version;
  const major = Number.parseInt(version.split('.')[0], 10);
  return Number.isNaN(major) ? null : major;
}

export function showFocusModeSetupUnavailableAlert(reason: 'authorization' | 'picker'): void {
  if (Platform.OS !== 'ios') {
    Alert.alert('App blocking unavailable', 'App blocking with Screen Time is only available on iPhone.');
    return;
  }

  const majorVersion = getIosMajorVersion();
  if (majorVersion != null && majorVersion < 16) {
    Alert.alert(
      'iOS update required',
      'App blocking requires a real iPhone running iOS 16 or later.',
    );
    return;
  }

  const detail =
    reason === 'authorization'
      ? 'Screen Time permission was not granted, or Family Controls is not available for this build.'
      : 'Could not open the Screen Time app picker.';

  Alert.alert(
    'App blocking unavailable',
    `${detail} This cannot be tested on the iOS Simulator. Please use a real iPhone with iOS 16 or later and a build signed with the Family Controls capability.`,
  );
}

/**
 * Best-effort Focus Mode reminder until native FocusFilterIntent (Phase 2).
 * The OS Focus filter must be enabled manually in Settings. Kept available for
 * Settings/onboarding use; no longer shown automatically at session start.
 */
export function remindFocusModeOnSessionStart(protocol: CoinType): void {
  const label = COIN_LABELS[protocol];
  const platformHint =
    Platform.OS === 'ios'
      ? 'Turn on the matching Focus filter in Settings → Focus.'
      : 'Configure Focus or Do Not Disturb in system settings.';

  Alert.alert(
    `${label} session`,
    `Keep Focus Mode active for this session. ${platformHint}`,
    [
      { text: 'Open Focus settings', onPress: () => openFocusSettings() },
      { text: 'Continue', style: 'cancel' },
    ],
  );
}
