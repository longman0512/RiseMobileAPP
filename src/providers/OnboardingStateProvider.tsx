import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from './AuthProvider';

type OnboardingStateContextValue = {
  loading: boolean;
  complete: boolean;
  markComplete: () => Promise<void>;
  refresh: () => Promise<void>;
};

const OnboardingStateContext = createContext<OnboardingStateContextValue | null>(null);

/** Pre-multi-account key. Migrated into the first signed-in user's key. */
const LEGACY_KEY = 'onboardingComplete';

function keyForUser(userId: string): string {
  return `onboardingComplete:${userId}`;
}

export function OnboardingStateProvider({ children }: { children: React.ReactNode }) {
  const { session, phase } = useAuth();
  const userId = session?.user?.id ?? null;

  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [complete, setComplete] = useState(false);

  const signedIn = phase === 'signedIn' && !!userId;
  const loading = signedIn && (hydratedUserId !== userId || fetching);

  const refresh = useCallback(async () => {
    if (!userId) {
      setComplete(false);
      setHydratedUserId(null);
      setFetching(false);
      return;
    }

    setFetching(true);
    const key = keyForUser(userId);
    let value = await AsyncStorage.getItem(key);

    if (value == null) {
      // One-time migration so existing installs are not re-onboarded.
      const legacy = await AsyncStorage.getItem(LEGACY_KEY);
      if (legacy === 'true') {
        await AsyncStorage.setItem(key, 'true');
        await AsyncStorage.removeItem(LEGACY_KEY);
        value = 'true';
      }
    }

    setComplete(value === 'true');
    setHydratedUserId(userId);
    setFetching(false);
  }, [userId]);

  const markComplete = useCallback(async () => {
    if (!userId) return;
    await AsyncStorage.setItem(keyForUser(userId), 'true');
    setComplete(true);
    setHydratedUserId(userId);
  }, [userId]);

  useEffect(() => {
    refresh().catch(() => {
      setHydratedUserId(userId);
      setFetching(false);
    });
  }, [refresh, userId]);

  const resolvedComplete = hydratedUserId === userId ? complete : false;

  const ctx = useMemo<OnboardingStateContextValue>(
    () => ({
      loading,
      complete: resolvedComplete,
      markComplete,
      refresh,
    }),
    [loading, resolvedComplete, markComplete, refresh],
  );

  return <OnboardingStateContext.Provider value={ctx}>{children}</OnboardingStateContext.Provider>;
}

export function useOnboardingState() {
  const ctx = useContext(OnboardingStateContext);
  if (!ctx) throw new Error('useOnboardingState must be used within OnboardingStateProvider');
  return ctx;
}
