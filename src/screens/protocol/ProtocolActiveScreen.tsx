import React, { useMemo } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { ProtocolStackParamList } from '../../navigation/protocol/ProtocolNavigator';
import { PROTOCOL_CONFIG } from '../../lib/protocolConfig';
import { useSession } from '../../providers/SessionProvider';
import { COIN_LABELS } from '../../types/coins';

type Props = NativeStackScreenProps<ProtocolStackParamList, 'Active'>;

export function ProtocolActiveScreen({ route }: Props) {
  const session = useSession();
  const protocol = session.activeProtocol ?? route.params.protocol;
  const config = PROTOCOL_CONFIG[protocol];
  const isReset = protocol === 'reset';

  const displaySeconds =
    session.phase === 'overtime'
      ? session.overtimeSeconds
      : session.timeRemainingSeconds;

  const minutes = Math.floor(displaySeconds / 60);
  const seconds = displaySeconds % 60;

  const timerLabel = useMemo(() => {
    if (session.phase === 'overtime') {
      return `+${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [minutes, seconds, session.phase]);

  const canPause = config.allowsPause && session.phase === 'active';

  return (
    <View className="flex-1 bg-[#0D0D0D] items-center justify-center px-6">
      <Text className="text-zinc-500 text-[40px] tracking-widest uppercase mb-4">
        {COIN_LABELS[protocol]}
      </Text>

      {isReset ? (
        <Text className="text-zinc-300 text-lg text-center mb-10 px-4 leading-7">
          {session.resetInstruction}
        </Text>
      ) : null}

      <Text className="text-white text-[88px] font-semibold tabular-nums">{timerLabel}</Text>

      {session.phase === 'overtime' ? (
        <Text className="text-zinc-500 mt-2 text-sm">Overtime — tap End when finished</Text>
      ) : null}

      {config.allowsThoughtCapture ? (
        <TextInput
          className="mt-10 w-full max-w-md rounded-xl border border-white/10 bg-zinc-900/80 px-4 py-3 text-white"
          placeholder="Capture a thought…"
          placeholderTextColor="#71717a"
          value={session.flowThought}
          onChangeText={session.setFlowThought}
          multiline
        />
      ) : null}

      {canPause ? (
        <Text className="text-zinc-600 mt-6 text-sm">Tap RESET coin to pause for recovery</Text>
      ) : null}

      <Pressable
        className="absolute bottom-6 left-6 right-6 h-12 rounded-xl border border-white/20 items-center justify-center"
        onPress={session.endSessionEarly}
      >
        <Text className="text-white font-semibold">End session</Text>
      </Pressable>
    </View>
  );
}
