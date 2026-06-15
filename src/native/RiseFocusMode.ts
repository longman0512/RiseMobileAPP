import { NativeModules, Platform } from 'react-native';

import type { CoinType } from '../types/coins';

type RiseFocusModeNative = {
  activate: (protocol: CoinType) => Promise<boolean>;
};

const native: RiseFocusModeNative | undefined =
  Platform.OS === 'android' ? NativeModules.RiseFocusMode : undefined;

/** Returns true when the OS Focus/restriction layer was activated (Phase 2). */
export async function activateNativeFocusMode(protocol: CoinType): Promise<boolean> {
  if (!native?.activate) return false;
  try {
    return await native.activate(protocol);
  } catch {
    return false;
  }
}
