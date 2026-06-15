import { useEffect, useState } from 'react';

import { markInitialBootstrapDone, isInitialBootstrapDone } from '../lib/initialBootstrap';
import { useAuth } from '../providers/AuthProvider';
import { useCoins } from '../providers/CoinsProvider';
import { useOnboardingState } from '../providers/OnboardingStateProvider';

const SPLASH_MIN_MS = 2200;

export function useAppBootstrap() {
  const { phase } = useAuth();
  const coins = useCoins();
  const onboarding = useOnboardingState();
  const [minDurationElapsed, setMinDurationElapsed] = useState(false);
  const [, setLatchTick] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setMinDurationElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(timer);
  }, []);

  const isBootstrapping =
    phase === 'loading' ||
    (phase === 'signedIn' && (coins.loading || onboarding.loading));

  useEffect(() => {
    if (isInitialBootstrapDone()) return;
    if (minDurationElapsed && !isBootstrapping) {
      markInitialBootstrapDone();
      setLatchTick((n) => n + 1);
    }
  }, [minDurationElapsed, isBootstrapping]);

  const initialDone = isInitialBootstrapDone();
  const showSplash = !initialDone && (!minDurationElapsed || isBootstrapping);

  return { showSplash, isBootstrapping, initialBootstrapDone: initialDone };
}
