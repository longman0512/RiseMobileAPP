import { useEffect } from 'react';
import { Linking } from 'react-native';

import { isAuthDeepLink, parseProtocolFromUrl } from '../lib/protocolDeepLink';
import { consumePendingProtocol, queuePendingProtocol } from './SessionProvider';
import { useAuth } from './AuthProvider';
import { useCoins } from './CoinsProvider';
import { useSession } from './SessionProvider';

export function ProtocolDeepLinkHandler() {
  const { phase } = useAuth();
  const { coins } = useCoins();
  const { handleProtocolTrigger } = useSession();

  const handleUrl = (url: string | null) => {
    if (!url || isAuthDeepLink(url)) return;

    const protocol = parseProtocolFromUrl(url);
    if (!protocol) return;

    if (phase !== 'signedIn') {
      queuePendingProtocol(protocol);
      return;
    }

    const hasRegistered = coins.some((c) => c.coin_type === protocol && c.active);
    handleProtocolTrigger(protocol, { hasRegisteredCoin: hasRegistered });
  };

  useEffect(() => {
    if (phase !== 'signedIn') return;

    const pending = consumePendingProtocol();
    if (pending) {
      const hasRegistered = coins.some((c) => c.coin_type === pending && c.active);
      handleProtocolTrigger(pending, { hasRegisteredCoin: hasRegistered });
    }
  }, [phase, coins, handleProtocolTrigger]);

  useEffect(() => {
    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => {});

    const sub = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => sub.remove();
  }, [handleProtocolTrigger, coins, phase]);

  return null;
}
