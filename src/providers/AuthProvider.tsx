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

/**
 * True only when the server actively rejected the credentials. A dropped
 * connection, a DNS failure or a timeout must never sign the user out — the
 * stored refresh token is still perfectly good once the network returns.
 */
function isRejectedCredentialError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = (error as { status?: number }).status;
  if (status === 401 || status === 403) return true;
  const name = (error as { name?: string }).name ?? '';
  // supabase-js tags offline/5xx failures as retryable; those are not rejections.
  if (name === 'AuthRetryableFetchError') return false;
  const message = ((error as { message?: string }).message ?? '').toLowerCase();
  return (
    message.includes('invalid claim') ||
    message.includes('invalid jwt') ||
    message.includes('jwt expired') ||
    message.includes('user not found') ||
    message.includes('session not found') ||
    message.includes('session_not_found')
  );
}

/** PostgREST reports "no rows" for `.single()`; `.maybeSingle()` returns null. */
function isMissingProfileError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === 'PGRST116';
}

type ValidationOutcome =
  | { kind: 'valid'; session: Session }
  | { kind: 'signedOut' }
  | { kind: 'unverified'; session: Session };

async function validateSession(): Promise<ValidationOutcome> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { kind: 'signedOut' };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (user && !error) {
    return { kind: 'valid', session };
  }

  if (isRejectedCredentialError(error)) {
    await supabase.auth.signOut();
    return { kind: 'signedOut' };
  }

  // Could not reach the server: keep the cached session so the app stays usable
  // offline and revalidates on the next foreground.
  return { kind: 'unverified', session };
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
      const outcome = await validateSession();
      const nextSession = outcome.kind === 'signedOut' ? null : outcome.session;
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
        // Never clear a stored session because validation threw (offline, DNS,
        // timeout); supabase-js will refresh it when the network is back.
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
        // Keep the current session; a failed revalidation is not a sign-out.
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
        .maybeSingle();

      if (cancelled) return;

      if (!error) {
        setNeedsUsername(!data?.username);
      } else if (isMissingProfileError(error)) {
        // The row genuinely is not there yet — send the user to CreateUsername.
        setNeedsUsername(true);
      }
      // Any other error is a transport problem: leave the last known answer in
      // place rather than trapping an existing user on the username screen.
      setProfileLoading(false);
    };

    checkProfile().catch(() => {
      if (!cancelled) {
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
