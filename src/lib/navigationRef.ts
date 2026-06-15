import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from '../navigation/RootNavigator';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateProtocolStack(
  screen: 'PreStart' | 'Active' | 'Summary' | 'Journal' | 'RegisterCoin',
  params?: Record<string, unknown>,
): void {
  if (!navigationRef.isReady()) return;

  navigationRef.navigate('Protocol', {
    screen,
    params,
  } as never);
}

export function resetToApp(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: 'App' }],
    }),
  );
}
