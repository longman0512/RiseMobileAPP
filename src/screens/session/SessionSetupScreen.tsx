import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { SessionStackParamList } from '../../navigation/session/SessionNavigator';

const presets = [15, 25, 45, 60] as const;

export function SessionSetupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SessionStackParamList>>();
  const [minutes, setMinutes] = useState<(typeof presets)[number]>(45);

  const canStart = useMemo(() => minutes > 0, [minutes]);

  return (
    <View className="flex-1 bg-black px-6 py-10">
      <Text className="text-white text-3xl font-bold">Session setup</Text>
      <Text className="text-zinc-400 mt-2">Choose a focus duration.</Text>

      <View className="mt-10 flex-row flex-wrap gap-3">
        {presets.map((m) => (
          <Pressable
            key={m}
            onPress={() => setMinutes(m)}
            className={[
              'px-4 py-3 rounded-xl border',
              minutes === m ? 'bg-white border-white' : 'bg-transparent border-white/10',
            ].join(' ')}
          >
            <Text className={minutes === m ? 'text-black font-semibold' : 'text-white'}>
              {m}m
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="flex-1" />

      <Pressable
        disabled={!canStart}
        className="h-14 rounded-2xl bg-white items-center justify-center"
        onPress={() => navigation.replace('SessionActive', { durationMinutes: minutes })}
      >
        <Text className="text-black font-semibold text-base">Start session</Text>
      </Pressable>
    </View>
  );
}

