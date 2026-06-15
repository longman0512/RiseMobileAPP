import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';

type ActivationContextValue = {
  loading: boolean;
  activated: boolean;
  refresh: () => Promise<void>;
};

const ActivationContext = createContext<ActivationContextValue | null>(null);

export function ActivationProvider({ children }: { children: React.ReactNode }) {
  const { session, phase } = useAuth();
  const userId = session?.user?.id;

  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [activated, setActivated] = useState(false);

  const isHydrated = phase === 'signedIn' && !!userId && hydratedUserId === userId;
  const loading = phase === 'signedIn' && !!userId && (!isHydrated || fetching);

  const refresh = useCallback(async () => {
    if (phase !== 'signedIn' || !userId) {
      setActivated(false);
      setHydratedUserId(null);
      setFetching(false);
      return;
    }

    setFetching(true);

    const { data } = await supabase
      .from('activation_codes')
      .select('id, used, user_id')
      .eq('user_id', userId)
      .eq('used', true)
      .single();

    setActivated(!!data);
    setHydratedUserId(userId);
    setFetching(false);
  }, [phase, userId]);

  useEffect(() => {
    refresh().catch(() => {
      if (phase === 'signedIn' && userId) {
        setHydratedUserId(userId);
      }
      setFetching(false);
    });
  }, [refresh, phase, userId]);

  const resolvedActivated = isHydrated ? activated : false;

  const value = useMemo<ActivationContextValue>(
    () => ({ loading, activated: resolvedActivated, refresh }),
    [loading, resolvedActivated, refresh],
  );

  return <ActivationContext.Provider value={value}>{children}</ActivationContext.Provider>;
}

export function useActivation() {
  const ctx = useContext(ActivationContext);
  if (!ctx) throw new Error('useActivation must be used within ActivationProvider');
  return ctx;
}
