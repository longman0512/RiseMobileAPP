import { NativeModules, Platform } from 'react-native';

import type { CoinType } from '../types/coins';

type RiseFocusModeNative = {
  activate: (protocol: CoinType) => Promise<boolean>;
  deactivate?: () => Promise<void>;
  requestAuthorization?: () => Promise<boolean>;
  isAuthorized?: () => Promise<boolean>;
  presentPicker?: (protocol: CoinType) => Promise<boolean>;
  hasSelection?: (protocol: CoinType) => Promise<boolean>;
};

const native: RiseFocusModeNative | undefined =
  Platform.OS === 'ios' || Platform.OS === 'android' ? NativeModules.RiseFocusMode : undefined;

/** Returns true when the OS Focus/restriction layer was activated. */
export async function activateNativeFocusMode(protocol: CoinType): Promise<boolean> {
  if (!native?.activate) return false;
  try {
    return await native.activate(protocol);
  } catch {
    return false;
  }
}

export async function deactivateNativeFocusMode(): Promise<void> {
  if (!native?.deactivate) return;
  try {
    await native.deactivate();
  } catch {
    // Best-effort cleanup only.
  }
}

export async function requestNativeFocusAuthorization(): Promise<boolean> {
  if (!native?.requestAuthorization) return false;
  try {
    return await native.requestAuthorization();
  } catch {
    return false;
  }
}

export async function isNativeFocusAuthorized(): Promise<boolean> {
  if (!native?.isAuthorized) return false;
  try {
    return await native.isAuthorized();
  } catch {
    return false;
  }
}

export async function presentNativeFocusPicker(protocol: CoinType): Promise<boolean> {
  if (protocol === 'reset') return false;
  if (!native?.presentPicker) return false;
  try {
    return await native.presentPicker(protocol);
  } catch {
    return false;
  }
}

export async function hasNativeFocusSelection(protocol: CoinType): Promise<boolean> {
  if (protocol === 'reset') return false;
  if (!native?.hasSelection) return false;
  try {
    return await native.hasSelection(protocol);
  } catch {
    return false;
  }
}
