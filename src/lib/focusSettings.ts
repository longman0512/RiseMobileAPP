import { Linking, Platform } from 'react-native';

export function openFocusSettings(): void {
  if (Platform.OS === 'ios') {
    Linking.openURL('App-Prefs:FOCUS').catch(() => Linking.openSettings());
  } else {
    Linking.openSettings();
  }
}
