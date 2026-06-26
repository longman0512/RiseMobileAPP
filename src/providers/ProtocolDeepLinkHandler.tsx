import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';

import {
  areProtocolDeepLinksSuppressed,
  isAuthDeepLink,
  parseProtocolFromUrl,
} from '../lib/protocolDeepLink';
import { consumePendingProtocol, queuePendingProtocol } from './SessionProvider';
import { useAuth } from './AuthProvider';
import { useCoins } from './CoinsProvider';
import { useSession } from './SessionProvider';

export function ProtocolDeepLinkHandler() {
  const { phase } = useAuth();
  const { coins, loading } = useCoins();
  const { handleProtocolTrigger } = useSession();

  // The iOS launch URL returned by getInitialURL() persists for the whole app
  // lifetime, so it must be consumed exactly once. Without this guard the effect
  // re-runs on every coins/phase change and re-opens PreStart after a session
  // ends, trapping the user.
  const initialUrlHandledRef = useRef(false);

  // Decide ownership against the Supabase-synced coin list and start the flow.
  // Only call this once coins have finished loading, otherwise a cold start
  // evaluates against an empty list and falsely reports the coin as unregistered.
  const triggerForProtocol = (protocol: ReturnType<typeof parseProtocolFromUrl>) => {
    if (!protocol) return;
    if (areProtocolDeepLinksSuppressed()) return;

    if (phase !== 'signedIn') {
      queuePendingProtocol(protocol);
      return;
    }

    // Coins not hydrated yet: queue and let the effect below replay once loaded.
    if (loading) {
      queuePendingProtocol(protocol);
      return;
    }

    const hasRegistered = coins.some((c) => c.coin_type === protocol && c.active);
    handleProtocolTrigger(protocol, { hasRegisteredCoin: hasRegistered });
  };

  const handleUrl = (url: string | null) => {
    if (!url || isAuthDeepLink(url)) return;
    if (areProtocolDeepLinksSuppressed()) return;
    triggerForProtocol(parseProtocolFromUrl(url));
  };

  // Replay any queued protocol once signed in AND coins have finished loading.
  // This covers both the not-signed-in case and the cold-start race where the
  // launch URL arrived before the coin list was hydrated.
  useEffect(() => {
    if (phase !== 'signedIn' || loading) return;
    if (areProtocolDeepLinksSuppressed()) return;

    const pending = consumePendingProtocol();
    if (!pending) return;

    const hasRegistered = coins.some((c) => c.coin_type === pending && c.active);
    handleProtocolTrigger(pending, { hasRegisteredCoin: hasRegistered });
  }, [phase, loading, coins, handleProtocolTrigger]);

  useEffect(() => {
    // Consume the cold-start launch URL exactly once.
    if (!initialUrlHandledRef.current) {
      initialUrlHandledRef.current = true;
      Linking.getInitialURL()
        .then(handleUrl)
        .catch(() => {});
    }

    // Warm taps deliver a fresh 'url' event each time; these are naturally
    // one-shot and safe to handle directly.
    const sub = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, loading, coins, handleProtocolTrigger]);

  return null;
}
