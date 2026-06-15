import React, { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { syncSessionBackgroundMode } from '../lib/backgroundSession';
import { showErrorToast } from '../lib/toast';
import { COIN_LABELS } from '../types/coins';
import { useSession } from './SessionProvider';

/**
 * Background keep-alive while a protocol session is active.
 * Foreground: no banner over the app (iOS silent in Notification Center; no Android FG notif).
 * Background: foreground service / session notification as usual.
 */
export function BackgroundSessionProvider({ children }: { children: React.ReactNode }) {
  const { isSessionBlocking, activeProtocol } = useSession();
  const blocking = isSessionBlocking();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const label = activeProtocol ? `${COIN_LABELS[activeProtocol]} session in progress` : undefined;

    const run = async () => {
      try {
        await syncSessionBackgroundMode({
          sessionActive: blocking,
          sessionLabel: label,
          appInForeground: appState === 'active',
        });
      } catch (e: unknown) {
        if (!blocking) return;
        const message = e instanceof Error ? e.message : 'Could not start background session.';
        showErrorToast('Background session', message);
      }
    };

    void run();
  }, [activeProtocol, appState, blocking]);

  return <>{children}</>;
}
