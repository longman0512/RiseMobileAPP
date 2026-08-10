import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ensureFriendCode } from '../lib/squadApi';
import { useAuth } from './AuthProvider';

type SquadContextValue = {
  /** This account's 6-character friend code. Null until it has been issued. */
  myCode: string | null;
  refreshCode: () => Promise<void>;
};

const SquadContext = createContext<SquadContextValue | null>(null);

/**
 * Holds this account's friend code. Codes are issued by the database, never by
 * the user, and accounts created before the Squad feature shipped don't have
 * one — so we ask for it once per sign-in and the RPC backfills if needed.
 *
 * Lives above the Squad screen because Settings shows the code too, and a user
 * may never open the Squad tab.
 */
export function SquadProvider({ children }: { children: React.ReactNode }) {
  const { phase, session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [myCode, setMyCode] = useState<string | null>(null);

  const refreshCode = useCallback(async () => {
    if (phase !== 'signedIn' || !userId) {
      setMyCode(null);
      return;
    }
    const code = await ensureFriendCode();
    if (code) setMyCode(code);
  }, [phase, userId]);

  useEffect(() => {
    let cancelled = false;

    if (phase !== 'signedIn' || !userId) {
      setMyCode(null);
      return;
    }

    void (async () => {
      const code = await ensureFriendCode();
      if (!cancelled && code) setMyCode(code);
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, userId]);

  const value = useMemo<SquadContextValue>(() => ({ myCode, refreshCode }), [myCode, refreshCode]);

  return <SquadContext.Provider value={value}>{children}</SquadContext.Provider>;
}

export function useSquadCode() {
  const ctx = useContext(SquadContext);
  if (!ctx) throw new Error('useSquadCode must be used within SquadProvider');
  return ctx;
}
