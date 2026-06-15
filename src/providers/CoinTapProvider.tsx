import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState, Platform } from 'react-native';

import {
  isNfcBusy,
  isNfcCancelError,
  readCoinIdOnce,
  setNfcBusy,
  startNfcListener,
  subscribeNfcBusy,
} from '../lib/nfc';
import { showErrorToast } from '../lib/toast';
import { useAuth } from './AuthProvider';
import { useCoins } from './CoinsProvider';
import { useOnboardingState } from './OnboardingStateProvider';
import { useSession } from './SessionProvider';

type CoinTapContextValue = {
  /** iOS: opens the system scan sheet to read a coin and start its session. */
  scanCoin: () => void;
  scanning: boolean;
};

const CoinTapContext = createContext<CoinTapContextValue | null>(null);

/** Ignore repeat taps of the same coin within this window (ms). */
const TAP_DEBOUNCE_MS = 2500;

export function CoinTapProvider({ children }: { children: React.ReactNode }) {
  const { phase: authPhase } = useAuth();
  const { needsCoinOnboarding, resolveCoinForSession } = useCoins();
  const { complete: onboardingComplete } = useOnboardingState();
  const { handleProtocolTrigger } = useSession();

  const busy = useSyncExternalStore(subscribeNfcBusy, isNfcBusy);
  const [appActive, setAppActive] = useState(() => AppState.currentState === 'active');
  const [scanning, setScanning] = useState(false);

  const lastTapAtRef = useRef(0);

  const showOnboarding = needsCoinOnboarding || !onboardingComplete;
  const signedIn = authPhase === 'signedIn';

  const onCoinId = useCallback(
    async (coinId: string) => {
      const now = Date.now();
      if (now - lastTapAtRef.current < TAP_DEBOUNCE_MS) return;
      lastTapAtRef.current = now;

      try {
        const coinType = await resolveCoinForSession(coinId);
        if (coinType) {
          handleProtocolTrigger(coinType, { hasRegisteredCoin: true });
        } else {
          showErrorToast('Unknown coin', "This coin isn't registered to your account.");
        }
      } catch {
        showErrorToast('Coin check failed', 'Could not verify the coin. Please try again.');
      }
    },
    [resolveCoinForSession, handleProtocolTrigger],
  );

  // Keep the latest handler in a ref so the passive listener effect does not
  // tear down/restart whenever the callback identity changes.
  const onCoinIdRef = useRef(onCoinId);
  useEffect(() => {
    onCoinIdRef.current = onCoinId;
  }, [onCoinId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => sub.remove();
  }, []);

  // Android: passive foreground listener. iOS cannot listen passively (it always
  // shows a scan sheet), so it relies on scanCoin() below instead.
  const passiveEnabled =
    Platform.OS === 'android' && appActive && signedIn && !showOnboarding && !busy;

  useEffect(() => {
    if (!passiveEnabled) return;

    let stop: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const teardown = await startNfcListener((coinId) => onCoinIdRef.current(coinId), {
          readerMode: true,
        });
        if (cancelled) {
          await teardown();
          return;
        }
        stop = teardown;
      } catch {
        // NFC unavailable/off; stay silent for the passive listener.
      }
    })();

    return () => {
      cancelled = true;
      if (stop) void stop();
    };
  }, [passiveEnabled]);

  const scanCoin = useCallback(() => {
    if (!signedIn) {
      showErrorToast('Sign in required', 'Sign in to scan a coin.');
      return;
    }
    if (scanning) return;
    if (isNfcBusy()) {
      // A previous NFC session is still flagged as in-progress. Clear it so a
      // stuck flag can never permanently disable the button.
      setNfcBusy(false);
    }

    void (async () => {
      setScanning(true);
      setNfcBusy(true);
      try {
        const coinId = await readCoinIdOnce();
        await onCoinIdRef.current(coinId);
      } catch (error) {
        if (!isNfcCancelError(error)) {
          const message =
            error instanceof Error ? error.message : 'Could not start the coin scan.';
          showErrorToast('Scan failed', message);
        }
      } finally {
        setNfcBusy(false);
        setScanning(false);
      }
    })();
  }, [scanning, signedIn]);

  const value = useMemo<CoinTapContextValue>(
    () => ({ scanCoin, scanning }),
    [scanCoin, scanning],
  );

  return <CoinTapContext.Provider value={value}>{children}</CoinTapContext.Provider>;
}

export function useCoinTap() {
  const ctx = useContext(CoinTapContext);
  if (!ctx) throw new Error('useCoinTap must be used within CoinTapProvider');
  return ctx;
}
