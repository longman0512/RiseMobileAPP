import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type OnboardingStateContextValue = {
  loading: boolean;
  complete: boolean;
  markComplete: () => Promise<void>;
  refresh: () => Promise<void>;
};

const OnboardingStateContext = createContext<OnboardingStateContextValue | null>(null);

const KEY = 'onboardingComplete';

export function OnboardingStateProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [complete, setComplete] = useState(false);

  const loading = !hydrated || fetching;

  const refresh = useCallback(async () => {
    setFetching(true);
    const value = await AsyncStorage.getItem(KEY);
    setComplete(value === 'true');
    setHydrated(true);
    setFetching(false);
  }, []);

  const markComplete = useCallback(async () => {
    await AsyncStorage.setItem(KEY, 'true');
    setComplete(true);
    setHydrated(true);
  }, []);

  useEffect(() => {
    refresh().catch(() => {
      setHydrated(true);
      setFetching(false);
    });
  }, [refresh]);

  const resolvedComplete = hydrated ? complete : false;

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
