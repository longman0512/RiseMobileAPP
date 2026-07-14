import { NativeModules, Platform } from 'react-native';

import type { CoinType } from '../types/coins';

export type InstalledApp = {
  packageName: string;
  appName: string;
};

type RiseFocusModeNative = {
  activate: (protocol: CoinType) => Promise<boolean>;
  deactivate?: () => Promise<void>;
  requestAuthorization?: () => Promise<boolean>;
  isAuthorized?: () => Promise<boolean>;
  presentPicker?: (protocol: CoinType) => Promise<boolean>;
  hasSelection?: (protocol: CoinType) => Promise<boolean>;
  // Android app-blocking picker support (no native picker exists, so the app
  // list is surfaced to JS and the selection is stored natively).
  getInstalledApps?: () => Promise<InstalledApp[]>;
  getSelection?: (protocol: CoinType) => Promise<string[]>;
  setSelection?: (protocol: CoinType, packages: string[]) => Promise<boolean>;
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

/** Android only: installed apps for the in-app blocking picker. */
export async function getInstalledApps(): Promise<InstalledApp[]> {
  if (!native?.getInstalledApps) return [];
  try {
    return await native.getInstalledApps();
  } catch {
    return [];
  }
}

/** Android only: package names currently selected for a protocol's blocklist. */
export async function getNativeFocusSelection(protocol: CoinType): Promise<string[]> {
  if (protocol === 'reset' || !native?.getSelection) return [];
  try {
    return await native.getSelection(protocol);
  } catch {
    return [];
  }
}

/** Android only: persist the package names to block for a protocol. */
export async function setNativeFocusSelection(
  protocol: CoinType,
  packages: string[],
): Promise<boolean> {
  if (protocol === 'reset' || !native?.setSelection) return false;
  try {
    return await native.setSelection(protocol, packages);
  } catch {
    return false;
  }
}
