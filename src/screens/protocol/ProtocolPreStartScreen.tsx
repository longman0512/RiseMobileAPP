import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { DurationSlider, snapDurationMinutes } from '../../components/DurationSlider';
import type { ProtocolStackParamList } from '../../navigation/protocol/ProtocolNavigator';
import { openFocusSettings } from '../../lib/focusSettings';
import { PROTOCOL_CONFIG } from '../../lib/protocolConfig';
import { useSession } from '../../providers/SessionProvider';
import { COIN_LABELS } from '../../types/coins';

type Props = NativeStackScreenProps<ProtocolStackParamList, 'PreStart'>;

export function ProtocolPreStartScreen({ route }: Props) {
  const { protocol } = route.params;
  const session = useSession();
  const config = PROTOCOL_CONFIG[protocol];

  const [minutes, setMinutes] = useState(() =>
    snapDurationMinutes(session.plannedMinutes, config.minMinutes, config.maxMinutes),
  );

  useEffect(() => {
    setMinutes(
      snapDurationMinutes(session.plannedMinutes, config.minMinutes, config.maxMinutes),
    );
  }, [config.maxMinutes, config.minMinutes, protocol, session.plannedMinutes]);

  const onBegin = () => {
    session.beginSession(minutes);
  };

  return (
    <View className="flex-1 bg-[#0D0D0D] px-6 py-12 justify-center">
      <Text className="text-white text-4xl font-bold text-center">{COIN_LABELS[protocol]}</Text>

      <Text className="text-zinc-400 text-center mt-10 text-sm">
        Set duration ({config.minMinutes}–{config.maxMinutes} min)
      </Text>

      <View className="mt-8 px-2">
        <DurationSlider
          minMinutes={config.minMinutes}
          maxMinutes={config.maxMinutes}
          stepMinutes={1}
          value={minutes}
          onChange={setMinutes}
        />
      </View>

      <Text className="text-zinc-500 text-center mt-4 text-base">
        Place your coin on the desk.
      </Text>

      {protocol === 'flow' ? (
        <Text className="text-zinc-600 text-center mt-6 text-xs px-4">
          Priority contacts can reach you when Focus Mode is configured.
        </Text>
      ) : null}

      <Pressable onPress={openFocusSettings} className="mt-8">
        <Text className="text-zinc-500 text-center text-sm underline">
          Configure Focus Mode in Settings (recommended)
        </Text>
      </Pressable>

      <View className="flex-1" />

      <Pressable className="h-14 rounded-2xl bg-white items-center justify-center" onPress={onBegin}>
        <Text className="text-black font-semibold text-base">BEGIN</Text>
      </Pressable>
    </View>
  );
}
