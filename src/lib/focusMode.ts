import { Alert, Platform } from 'react-native';

import { openFocusSettings } from './focusSettings';
import { activateNativeFocusMode } from '../native/RiseFocusMode';
import type { CoinType } from '../types/coins';
import { COIN_LABELS } from '../types/coins';

/** Try native activation (Phase 2 stub), then show a one-time Settings reminder. */
export async function activateFocusModeOnSessionStart(protocol: CoinType): Promise<void> {
  const activated = await activateNativeFocusMode(protocol);
  if (activated) return;
  remindFocusModeOnSessionStart(protocol);
}

/**
 * Best-effort Focus Mode reminder until native FocusFilterIntent (Phase 2).
 * The OS Focus filter must be enabled manually in Settings.
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
