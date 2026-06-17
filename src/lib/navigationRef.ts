import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from '../navigation/RootNavigator';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

type ProtocolScreen = 'PreStart' | 'Active' | 'Summary' | 'Journal' | 'RegisterCoin';

type PendingProtocolNav = {
  screen: ProtocolScreen;
  params?: Record<string, unknown>;
};

// On a cold start (e.g. opening from an NFC Universal Link), the deep-link
// handler can resolve the protocol before the NavigationContainer is ready.
// We stash the intended navigation and flush it from the container's onReady,
// so the app lands on PreStart instead of silently staying on the main screen.
let pendingProtocolNav: PendingProtocolNav | null = null;

function performProtocolNavigation(nav: PendingProtocolNav): void {
  navigationRef.navigate('Protocol', {
    screen: nav.screen,
    params: nav.params,
  } as never);
}

export function navigateProtocolStack(
  screen: ProtocolScreen,
  params?: Record<string, unknown>,
): void {
  const nav: PendingProtocolNav = { screen, params };

  if (!navigationRef.isReady()) {
    // Defer until the navigation container is ready (flushed in onReady).
    pendingProtocolNav = nav;
    return;
  }

  performProtocolNavigation(nav);
}

/**
 * Flush any protocol navigation that was requested before the navigation
 * container became ready. Call this from NavigationContainer's onReady.
 */
export function flushPendingProtocolNavigation(): void {
  if (!pendingProtocolNav) return;
  if (!navigationRef.isReady()) return;

  const nav = pendingProtocolNav;
  pendingProtocolNav = null;
  performProtocolNavigation(nav);
}

export function resetToApp(): void {
  // Drop any queued protocol navigation so it can't re-open after a reset.
  pendingProtocolNav = null;

  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: 'App' }],
    }),
  );
}
