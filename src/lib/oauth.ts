import { Alert, Linking } from 'react-native';
import InAppBrowser from 'react-native-inappbrowser-reborn';

import { env } from '../config/env';
import { handleAuthCallbackUrl } from './authCallback';
import { supabase } from './supabase';

export type OAuthProvider = 'google' | 'apple';

export async function signInWithOAuthProvider(provider: OAuthProvider): Promise<void> {
  const redirectTo = env.OAUTH_REDIRECT_URL;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    Alert.alert('Login failed', error.message);
    return;
  }

  if (!data?.url) {
    Alert.alert('Login failed', 'No authorization URL returned.');
    return;
  }

  const isAvailable = await InAppBrowser.isAvailable();
  if (!isAvailable) {
    await Linking.openURL(data.url);
    return;
  }

  try {
    const result = await InAppBrowser.openAuth(data.url, redirectTo, {
      ephemeralWebSession: true,
      showTitle: false,
      enableUrlBarHiding: true,
      enableDefaultShare: false,
    });

    if (result.type === 'success' && result.url) {
      const ok = await handleAuthCallbackUrl(result.url, { showAlerts: true });
      if (!ok) {
        Alert.alert('Login failed', 'Could not complete sign-in. Please try again.');
      }
      return;
    }

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return;
    }

    Alert.alert('Login failed', 'Sign-in was not completed.');
  } catch {
    Alert.alert('Login failed', 'Unexpected error during sign-in. Please try again.');
  }
}
