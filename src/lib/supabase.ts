import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

import { env, isSupabaseConfigured } from '../config/env';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Copy mobile/.env.example to mobile/.env, set SUPABASE_URL and SUPABASE_ANON_KEY, then rebuild the app (npm run android).',
    );
  }

  if (!client) {
    client = createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
  }

  return client;
}

/** Lazy proxy so imports do not call createClient before env is available. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const value = getSupabase()[prop as keyof SupabaseClient];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(getSupabase());
    }
    return value;
  },
});
