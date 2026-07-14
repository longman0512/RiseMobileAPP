// `react-native-config` requires a native module. If it's not linked yet (or a dev
// build was installed without native integration), importing it can throw at
// runtime. We fall back to an empty object so the app can still boot into the
// Env setup screen.
let Config: Record<string, unknown> = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('react-native-config');
  Config = (mod?.default ?? mod?.Config ?? {}) as Record<string, unknown>;
} catch {
  Config = {};
}

export const env = {
  SUPABASE_URL: (Config?.SUPABASE_URL as string | undefined)?.trim() || undefined,
  SUPABASE_ANON_KEY:
    (Config?.SUPABASE_ANON_KEY as string | undefined)?.trim() || undefined,
  OAUTH_REDIRECT_URL:
    (Config?.OAUTH_REDIRECT_URL as string | undefined)?.trim() ??
    'risemobile://auth/callback',
  ENABLE_DEV_COIN_SIMULATOR:
    (Config?.ENABLE_DEV_COIN_SIMULATOR as string | undefined)?.trim() === 'true',
};

/** Dev panel for simulating NFC coin taps (ENABLE_DEV_COIN_SIMULATOR=true only). */
export function isDevCoinSimulatorEnabled(): boolean {
  return env.ENABLE_DEV_COIN_SIMULATOR;
}

export function isSupabaseConfigured(): boolean {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  if (url.includes('YOUR_PROJECT') || key.includes('your_anon_key')) return false;
  return true;
}

