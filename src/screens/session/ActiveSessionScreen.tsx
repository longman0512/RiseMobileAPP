import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { SessionStackParamList } from '../../navigation/session/SessionNavigator';
import { endSession } from '../../lib/sessionApi';

type Props = NativeStackScreenProps<SessionStackParamList, 'SessionActive'>;

export function ActiveSessionScreen({ navigation, route }: Props) {
  const totalSeconds = route.params.durationMinutes * 60;
  const [timeRemaining, setTimeRemaining] = useState(totalSeconds);
  const [paused, setPaused] = useState(false);
  const startedAt = useRef(new Date().toISOString());

  const [pop, setPop] = useState(false);
  const prev = useRef(timeRemaining);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      setTimeRemaining((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [paused]);

  useEffect(() => {
    if (timeRemaining === 0) {
      void endSession({
        coin_type: 'lockin',
        started_at: startedAt.current,
        duration_mins: route.params.durationMinutes,
        note: null,
        next_block: null,
      }).catch(() => {});
      navigation.popToTop();
    }
  }, [navigation, route.params.durationMinutes, timeRemaining]);

  useEffect(() => {
    if (timeRemaining !== prev.current) {
      setPop(true);
      const t = setTimeout(() => setPop(false), 250);
      prev.current = timeRemaining;
      return () => clearTimeout(t);
    }
  }, [timeRemaining]);

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const progress = useMemo(
    () => ((totalSeconds - timeRemaining) / totalSeconds) * 100,
    [timeRemaining, totalSeconds],
  );

  return (
    <View className="flex-1 bg-[#0A0A0C] items-center justify-center">
      <Pressable onPress={() => setPaused((p) => !p)} className="items-center">
        <Text
          className={[
            'text-white font-semibold',
            pop ? 'text-[92px]' : 'text-[88px]',
          ].join(' ')}
        >
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </Text>
        <Text className="text-zinc-400 mt-3">{paused ? 'Tap to resume' : 'Tap to pause'}</Text>
      </Pressable>

      <View className="absolute bottom-0 left-0 right-0 px-6 pb-20">
        <View className="flex-row justify-between mb-2">
          <Text className="text-zinc-500 text-xs">{Math.floor(progress)}%</Text>
          <Text className="text-zinc-500 text-xs">{route.params.durationMinutes}m</Text>
        </View>
        <View className="h-1 bg-white/10 rounded-full overflow-hidden">
          <View className="h-1 bg-white" style={{ width: `${progress}%` }} />
        </View>
      </View>

      <Pressable
        onPress={() => navigation.popToTop()}
        className="absolute bottom-6 px-6 py-3 rounded-full border border-white/10"
      >
        <Text className="text-zinc-300">Cancel</Text>
      </Pressable>
    </View>
  );
}

