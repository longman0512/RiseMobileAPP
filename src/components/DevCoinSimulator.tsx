import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { isDevCoinSimulatorEnabled } from '../config/env';
import { buildProtocolDeepLink, simulateProtocolTap } from '../lib/protocolDeepLink';
import { useAuth } from '../providers/AuthProvider';
import { useCoins } from '../providers/CoinsProvider';
import { useSession } from '../providers/SessionProvider';
import { COIN_LABELS, COIN_TYPES, type CoinType } from '../types/coins';

type Props = {
  compact?: boolean;
};

export function DevCoinSimulator({ compact = false }: Props) {
  const { phase: authPhase } = useAuth();
  const { coins } = useCoins();
  const session = useSession();
  const [bypassRegistration, setBypassRegistration] = useState(true);

  const registeredTypes = useMemo(
    () => coins.filter((c) => c.active).map((c) => c.coin_type),
    [coins],
  );

  if (!isDevCoinSimulatorEnabled()) {
    return null;
  }

  const onTap = (protocol: CoinType) => {
    const hasRegisteredCoin = bypassRegistration || coins.some((c) => c.coin_type === protocol && c.active);
    simulateProtocolTap(protocol, session.handleProtocolTrigger, { hasRegisteredCoin });
  };

  const pausedLabel =
    session.pausedFlowRemainingSeconds != null
      ? `${Math.ceil(session.pausedFlowRemainingSeconds / 60)} min remaining`
      : 'none';

  const pendingResumeLabel =
    session.pendingFlowResumeSeconds != null
      ? `${Math.ceil(session.pendingFlowResumeSeconds / 60)} min (tap FLOW)`
      : 'none';

  return (
    <View
      className={[
        'rounded-xl border border-dashed border-amber-500/50 bg-amber-950/20',
        compact ? 'px-3 py-3' : 'px-4 py-4 mt-4',
      ].join(' ')}
    >
      <Text className="text-amber-400 text-xs font-semibold uppercase tracking-wide">
        Dev — simulate NFC tap
      </Text>

      <View className={['flex-row gap-2', compact ? 'mt-2' : 'mt-3'].join(' ')}>
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

      {!compact ? (
        <View className="mt-3 pt-3 border-t border-amber-500/20">
          <Text className="text-zinc-500 text-[10px] font-mono leading-4">
            auth: {authPhase}
            {'\n'}
            session: {session.phase}
            {session.activeProtocol ? ` (${session.activeProtocol})` : ''}
            {'\n'}
            coins: {registeredTypes.length ? registeredTypes.join(', ') : 'none'}
            {'\n'}
            paused FLOW: {pausedLabel}
            {'\n'}
            pending resume: {pendingResumeLabel}
            {'\n'}
            deep link: {buildProtocolDeepLink('flow')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
