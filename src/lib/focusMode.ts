import { Alert, Platform } from 'react-native';

import { openFocusSettings } from './focusSettings';
import { activateNativeFocusMode } from '../native/RiseFocusMode';
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
