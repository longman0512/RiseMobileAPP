import { Alert } from 'react-native';

import { supabase } from './supabase';

export type AuthCallbackParams = {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
};

export function parseAuthCallbackUrl(url: string): AuthCallbackParams {
  try {
    const parsed = new URL(url);
    const hashParams = parsed.hash
      ? new URLSearchParams(parsed.hash.replace(/^#/, ''))
      : null;

    const get = (key: string) =>
      parsed.searchParams.get(key) ?? hashParams?.get(key) ?? null;

    return {
      code: get('code'),
      error: get('error'),
      errorDescription: get('error_description'),
    };
  } catch {
    return { code: null, error: null, errorDescription: null };
  }
}

/**
 * Exchanges an OAuth callback URL for a Supabase session.
 * @returns true if a session was established or already present
 */
export async function handleAuthCallbackUrl(
  url: string,
  options?: { showAlerts?: boolean },
): Promise<boolean> {
  const showAlerts = options?.showAlerts ?? false;
  const { code, error, errorDescription } = parseAuthCallbackUrl(url);

  if (error) {
    if (showAlerts) {
      Alert.alert('Login failed', errorDescription ?? error);
    }
    return false;
  }

  if (!code) {
    return false;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session) {
    return true;
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    if (showAlerts) {
      Alert.alert('Login failed', exchangeError.message);
    }
    return false;
  }

  return true;
}
