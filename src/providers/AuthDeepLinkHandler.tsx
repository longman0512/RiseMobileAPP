import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';

import { handleAuthCallbackUrl, parseAuthCallbackUrl } from '../lib/authCallback';

export function AuthDeepLinkHandler() {
  useEffect(() => {
    const handleUrl = async (url: string) => {
      const { code, error, errorDescription } = parseAuthCallbackUrl(url);

      if (error) {
        Alert.alert('Login failed', errorDescription ?? error);
        return;
      }

      if (!code) {
        return;
      }

      await handleAuthCallbackUrl(url, { showAlerts: true });
    };

    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          handleUrl(url).catch(() => {
            Alert.alert('Login failed', 'Could not complete sign-in from link.');
          });
        }
      })
      .catch(() => {});

    const sub = Linking.addEventListener('url', (event) => {
      handleUrl(event.url).catch(() => {
        Alert.alert('Login failed', 'Could not complete sign-in from link.');
      });
    });

    return () => sub.remove();
  }, []);

  return null;
}
