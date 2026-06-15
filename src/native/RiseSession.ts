import { NativeModules, Platform } from 'react-native';

type RiseSessionNative = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => Promise<boolean>;
};

const native: RiseSessionNative | undefined =
  Platform.OS === 'android' ? NativeModules.RiseSession : undefined;

export const RiseSession = native;
