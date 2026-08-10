import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import { normalizeCoinId } from '../lib/nfc';
import { COIN_ALREADY_LINKED_MESSAGE, type Coin, type CoinType } from '../types/coins';
import { useAuth } from './AuthProvider';

const LEGACY_DISMISSED_KEY = 'coinOnboardingDismissed';

/** Per-user snapshot of the coin list so a cold start offline still works. */
function cacheKeyForUser(userId: string): string {
  return `rise_coins_cache_v1:${userId}`;
}

async function readCachedCoins(userId: string): Promise<Coin[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKeyForUser(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Coin[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCachedCoins(userId: string, coins: Coin[]): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKeyForUser(userId), JSON.stringify(coins));
  } catch {
    // A failed cache write is not worth surfacing.
  }
}

type CoinsContextValue = {
  loading: boolean;
  coins: Coin[];
  needsCoinOnboarding: boolean;
  refresh: () => Promise<void>;
  registerCoin: (coinId: string, coinType: CoinType) => Promise<{ ok: true; coin: Coin } | { ok: false; message: string }>;
  registerCoinStrict: (coinId: string, coinType: CoinType) => Promise<{ ok: true; coin: Coin } | { ok: false; message: string }>;
  deleteCoin: (coinId: string) => Promise<{ ok: true; coin: Coin } | { ok: false; message: string }>;
  resolveCoinForSession: (coinId: string) => Promise<CoinType | null>;
  dismissCoinOnboarding: () => Promise<void>;
};

const CoinsContext = createContext<CoinsContextValue | null>(null);

function mapRegisterError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('already linked')) {
    return lower.includes('another account')
      ? 'This coin is already linked to another account.'
      : COIN_ALREADY_LINKED_MESSAGE;
  }
  if (lower.includes('already have an active')) return message;
  if (lower.includes('already registered as')) return message;
  return message;
}

export function CoinsProvider({ children }: { children: React.ReactNode }) {
  const { session, phase } = useAuth();
  const userId = session?.user?.id;

  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [coins, setCoins] = useState<Coin[]>([]);
  const [skippedThisSession, setSkippedThisSession] = useState(false);
  /** True when the last server read failed and the list may be incomplete. */
  const [coinsUnverified, setCoinsUnverified] = useState(false);

  const isHydrated = phase === 'signedIn' && !!userId && hydratedUserId === userId;
  const loading = phase === 'signedIn' && !!userId && (!isHydrated || fetching);

  useEffect(() => {
    if (phase !== 'signedIn' || !userId) {
      setSkippedThisSession(false);
    }
  }, [phase, userId]);

  const refresh = useCallback(async () => {
    if (phase !== 'signedIn' || !userId) {
      setCoins([]);
      setSkippedThisSession(false);
      setHydratedUserId(null);
      setFetching(false);
      setCoinsUnverified(false);
      return;
    }

    const alreadyHydrated = hydratedUserId === userId;
    if (!alreadyHydrated) {
      setFetching(true);
      const cached = await readCachedCoins(userId);
      if (cached) {
        setCoins(cached);
      }
    }

    const coinsResult = await supabase
      .from('coins')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true);

    if (coinsResult.error) {
      // Keep whatever we already have (cache or previous fetch). Overwriting it
      // with [] would report the user as coinless and bounce them into
      // onboarding just because the network blipped.
      setCoinsUnverified(true);
    } else {
      const nextCoins = (coinsResult.data as Coin[] | null) ?? [];
      setCoins(nextCoins);
      setCoinsUnverified(false);
      void writeCachedCoins(userId, nextCoins);
    }

    setHydratedUserId(userId);
    setFetching(false);

    AsyncStorage.removeItem(LEGACY_DISMISSED_KEY).catch(() => {});
  }, [phase, userId, hydratedUserId]);

  useEffect(() => {
    refresh().catch(() => {
      if (phase === 'signedIn' && userId) {
        setHydratedUserId(userId);
        setCoinsUnverified(true);
      }
      setFetching(false);
    });
  }, [refresh, phase, userId]);

  const registerCoin = useCallback(
    async (coinId: string, coinType: CoinType) => {
      const { data, error } = await supabase.rpc('register_coin', {
        p_coin_id: coinId,
        p_coin_type: coinType,
      });

      if (error) {
        return { ok: false as const, message: mapRegisterError(error.message) };
      }

      await refresh();
      return { ok: true as const, coin: data as Coin };
    },
    [refresh],
  );

  const registerCoinStrict = useCallback(
    async (coinId: string, coinType: CoinType) => {
      const normalized = normalizeCoinId(coinId);
      if (!normalized) {
        return { ok: false as const, message: 'Could not read coin ID from tag.' };
      }

      const { data, error } = await supabase.rpc('register_coin_strict', {
        p_coin_id: normalized,
        p_coin_type: coinType,
      });

      if (error) {
        return { ok: false as const, message: mapRegisterError(error.message) };
      }

      await refresh();
      return { ok: true as const, coin: data as Coin };
    },
    [refresh],
  );

  const deleteCoin = useCallback(
    async (coinId: string) => {
      const normalized = normalizeCoinId(coinId);
      if (!normalized) {
        return { ok: false as const, message: 'Could not read coin ID.' };
      }

      const { data, error } = await supabase.rpc('delete_my_coin', {
        p_coin_id: normalized,
      });

      if (error) {
        return { ok: false as const, message: error.message };
      }

      await refresh();
      return { ok: true as const, coin: data as Coin };
    },
    [refresh],
  );

  const resolveCoinForSession = useCallback(
    async (coinId: string): Promise<CoinType | null> => {
      const normalized = normalizeCoinId(coinId);
      if (!normalized) return null;

      const { data, error } = await supabase.rpc('resolve_coin_for_session', {
        p_coin_id: normalized,
      });

      if (!error) {
        return (data as CoinType | null) ?? null;
      }

      // Offline: fall back to the locally known coin list so tapping a coin the
      // user has already registered still starts a session.
      const local = coins.find((c) => c.active && normalizeCoinId(c.coin_id) === normalized);
      if (local) return local.coin_type;

      throw new Error(error.message);
    },
    [coins],
  );

  const dismissCoinOnboarding = useCallback(async () => {
    setSkippedThisSession(true);
  }, []);

  const needsCoinOnboarding = useMemo(() => {
    if (!isHydrated) return false;
    if (coins.length > 0) return false;
    if (skippedThisSession) return false;
    // "No coins" that we could not confirm with the server is not a reason to
    // restart onboarding — registering a coin needs the network anyway.
    if (coinsUnverified) return false;
    return true;
  }, [isHydrated, coins.length, skippedThisSession, coinsUnverified]);

  const value = useMemo<CoinsContextValue>(
    () => ({
      loading,
      coins,
      needsCoinOnboarding,
      refresh,
      registerCoin,
      registerCoinStrict,
      deleteCoin,
      resolveCoinForSession,
      dismissCoinOnboarding,
    }),
    [
      loading,
      coins,
      needsCoinOnboarding,
      refresh,
      registerCoin,
      registerCoinStrict,
      deleteCoin,
      resolveCoinForSession,
      dismissCoinOnboarding,
    ],
  );

  return <CoinsContext.Provider value={value}>{children}</CoinsContext.Provider>;
}

export function useCoins() {
  const ctx = useContext(CoinsContext);
  if (!ctx) throw new Error('useCoins must be used within CoinsProvider');
  return ctx;
}
