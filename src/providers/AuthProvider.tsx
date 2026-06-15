import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

export type AuthPhase = 'loading' | 'signedOut' | 'needsUsername' | 'signedIn';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  phase: AuthPhase;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function validateSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    await supabase.auth.signOut();
    return null;
  }

  return session;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileCheckVersion, setProfileCheckVersion] = useState(0);
  const validatingRef = useRef(false);

  const applyValidatedSession = useCallback(async () => {
    if (validatingRef.current) return null;
    validatingRef.current = true;
    try {
      const nextSession = await validateSession();
      setSession(nextSession);
      return nextSession;
    } finally {
      validatingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    applyValidatedSession()
      .catch(() => {
        if (!mounted) return;
        setSession(null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'INITIAL_SESSION') {
        return;
      }

      if (event === 'SIGNED_OUT' || !nextSession) {
        setSession(null);
        return;
      }

      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription?.subscription.unsubscribe();
    };
  }, [applyValidatedSession]);

  useEffect(() => {
    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active' || !session) return;

      applyValidatedSession().catch(() => {
        setSession(null);
      });
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [applyValidatedSession, session]);

  const refreshProfile = useCallback(async () => {
    setProfileCheckVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkProfile = async () => {
      if (!session?.user?.id) {
        setNeedsUsername(false);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);

      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', session.user.id)
        .single();

      if (cancelled) return;

      if (error) {
        setNeedsUsername(true);
      } else {
        setNeedsUsername(!data?.username);
      }
      setProfileLoading(false);
    };

    checkProfile().catch(() => {
      if (!cancelled) {
        setNeedsUsername(true);
        setProfileLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, profileCheckVersion]);

  const phase: AuthPhase =
    loading || (session && profileLoading)
      ? 'loading'
      : !session
        ? 'signedOut'
        : needsUsername
          ? 'needsUsername'
          : 'signedIn';

  const value = useMemo<AuthContextValue>(
    () => ({ session, loading, phase, refreshProfile }),
    [session, loading, phase, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
