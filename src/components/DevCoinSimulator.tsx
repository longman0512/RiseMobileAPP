import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { isDevCoinSimulatorEnabled } from '../config/env';
import {
  areProtocolDeepLinksSuppressed,
  buildProtocolDeepLink,
  simulateProtocolTap,
} from '../lib/protocolDeepLink';
import { showErrorToast, showSuccessToast } from '../lib/toast';
import { useAuth } from '../providers/AuthProvider';
import { useCoins } from '../providers/CoinsProvider';
import { useSession } from '../providers/SessionProvider';
import { COIN_LABELS, COIN_TYPES, type CoinType } from '../types/coins';

type Props = {
  compact?: boolean;
};

/**
 * Stand-in NFC chip UIDs, one per protocol. Hex only, so they survive
 * normalizeCoinId exactly as a real NTAG215 UID would.
 */
const DEV_COIN_IDS: Record<CoinType, string> = {
  lockin: 'DE7000000001',
  flow: 'DE7000000002',
  reset: 'DE7000000003',
};

export function DevCoinSimulator({ compact = false }: Props) {
  const { phase: authPhase } = useAuth();
  const { coins, registerCoinStrict } = useCoins();
  const session = useSession();
  const [bypassRegistration, setBypassRegistration] = useState(true);
  const [registering, setRegistering] = useState(false);

  const registeredTypes = useMemo(
    () => coins.filter((c) => c.active).map((c) => c.coin_type),
    [coins],
  );

  // Visible in any Debug build, so simulating a coin tap needs nothing more
  // than a Metro reload. __DEV__ is false in release builds, so this can never
  // ship; ENABLE_DEV_COIN_SIMULATOR additionally turns it on in a
  // TestFlight/QA build for testers who have no hardware.
  if (!__DEV__ && !isDevCoinSimulatorEnabled()) {
    return null;
  }

  const onTap = (protocol: CoinType) => {
    // Registration screens deliberately swallow protocol taps so a real coin
    // held against the phone cannot start a session mid-pairing. Say so rather
    // than looking broken.
    if (areProtocolDeepLinksSuppressed()) {
      showErrorToast(
        'Tap ignored here',
        'This screen owns the NFC reader. Use REG to register coins, or leave the screen first.',
      );
      return;
    }
    const hasRegisteredCoin = bypassRegistration || coins.some((c) => c.coin_type === protocol && c.active);
    simulateProtocolTap(protocol, session.handleProtocolTrigger, { hasRegisteredCoin });
  };

  /**
   * Register the three stand-in coins. A simulator has no NFC at all, so this
   * is the only way to get past coin onboarding and exercise the real
   * registration RPC, ownership checks and resolve_coin_for_session.
   */
  const onRegisterAll = () => {
    if (registering) return;
    void (async () => {
      setRegistering(true);
      const done: string[] = [];
      const failed: string[] = [];
      try {
        for (const type of COIN_TYPES) {
          if (coins.some((c) => c.coin_type === type && c.active)) continue;
          const result = await registerCoinStrict(DEV_COIN_IDS[type], type);
          if (result.ok) done.push(COIN_LABELS[type]);
          else failed.push(`${COIN_LABELS[type]}: ${result.message}`);
        }
      } finally {
        setRegistering(false);
      }

      if (failed.length > 0) {
        showErrorToast('Register failed', failed.join(' · '));
      } else {
        showSuccessToast(
          'Dev coins registered',
          done.length > 0 ? done.join(', ') : 'All three were already registered.',
        );
      }
    })();
  };

  const pausedLabel = session.pauseRemainingSeconds
    ? `${Math.ceil(session.pauseRemainingSeconds / 60)} min left`
    : 'none';

  const shiftLabel = session.shiftOpen
    ? `${session.shiftBlocks.length} block(s), ${session.shiftFocusMinutes} min`
    : 'closed';

  if (compact) {
    return (
      <View className="flex-row items-center gap-1.5 rounded-xl border border-dashed border-amber-500/50 bg-[#1A1508] px-2 py-1.5">
        <Text className="text-amber-400 text-[9px] font-bold tracking-widest">DEV</Text>
        {COIN_TYPES.map((type) => (
          <Pressable
            key={type}
            onPress={() => onTap(type)}
            className="flex-1 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 items-center"
            accessibilityLabel={`Simulate ${COIN_LABELS[type]} coin tap`}
          >
            <Text className="text-amber-100 text-[9.5px] font-bold">{COIN_LABELS[type]}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onRegisterAll}
          disabled={registering}
          className="px-2 py-1.5 rounded-lg bg-amber-500/25 border border-amber-500/50 items-center"
          accessibilityLabel="Register the three stand-in dev coins"
        >
          <Text className="text-amber-100 text-[9.5px] font-bold">
            {registering ? '…' : 'REG'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setBypassRegistration((v) => !v)}
          className={[
            'w-6 h-6 rounded-md border items-center justify-center',
            bypassRegistration ? 'bg-amber-500 border-amber-500' : 'border-zinc-600',
          ].join(' ')}
          accessibilityLabel="Treat coins as registered"
        >
          <Text
            className={[
              'text-[11px] font-bold',
              bypassRegistration ? 'text-black' : 'text-zinc-500',
            ].join(' ')}
          >
            ✓
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="rounded-xl border border-dashed border-amber-500/50 bg-[#1A1508] px-4 py-4 mt-4">
      <Text className="text-amber-400 text-xs font-semibold uppercase tracking-wide">
        Dev — simulate NFC tap
      </Text>

      <View className="flex-row gap-2 mt-3">
        {COIN_TYPES.map((type) => (
          <Pressable
            key={type}
            onPress={() => onTap(type)}
            className="flex-1 py-2.5 rounded-lg bg-amber-500/20 border border-amber-500/40 items-center"
          >
            <Text className="text-amber-100 text-xs font-bold">{COIN_LABELS[type]}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => setBypassRegistration((v) => !v)}
        className="mt-2 flex-row items-center"
      >
        <View
          className={[
            'w-4 h-4 rounded border mr-2 items-center justify-center',
            bypassRegistration ? 'bg-amber-500 border-amber-500' : 'border-zinc-500',
          ].join(' ')}
        >
          {bypassRegistration ? (
            <Text className="text-black text-[10px] font-bold">✓</Text>
          ) : null}
        </View>
        <Text className="text-zinc-400 text-xs flex-1">Treat coins as registered</Text>
      </Pressable>

      <View className="mt-3 pt-3 border-t border-amber-500/20">
          <Text className="text-zinc-500 text-[10px] font-mono leading-4">
            auth: {authPhase}
            {'\n'}
            session: {session.phase}
            {session.activeProtocol ? ` (${session.activeProtocol})` : ''}
            {'\n'}
            coins: {registeredTypes.length ? registeredTypes.join(', ') : 'none'}
            {'\n'}
            pause: {pausedLabel}
            {'\n'}
            shift: {shiftLabel}
            {'\n'}
            deep link: {buildProtocolDeepLink('flow')}
        </Text>
      </View>
    </View>
  );
}
