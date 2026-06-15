import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useOnboardingState } from '../../providers/OnboardingStateProvider';

export function DeviceNamingScreen() {
  const onboarding = useOnboardingState();
  const [deviceName, setDeviceName] = useState('RISE Bottle');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => deviceName.trim().length > 0 && !loading, [deviceName, loading]);

  const onContinue = async () => {
    setLoading(true);
    try {
      await AsyncStorage.setItem('deviceName', deviceName.trim());
      await onboarding.markComplete();
    } catch {
      Alert.alert('Failed', 'Could not save device name.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-black px-6">
      <View className="flex-1 justify-center">
        <Text className="text-white text-3xl font-bold text-center">Name your device</Text>
        <Text className="text-zinc-400 text-center mt-2">You can change this later.</Text>

        <View className="mt-10">
          <Text className="text-zinc-400 text-sm mb-2">Device name</Text>
          <TextInput
            className="h-12 rounded-xl bg-zinc-900/60 border border-white/10 px-4 text-white"
            value={deviceName}
            onChangeText={setDeviceName}
            placeholder="RISE Bottle"
            placeholderTextColor="#71717a"
          />

          <Pressable
            className={[
              'mt-6 h-12 rounded-xl items-center justify-center',
              canSubmit ? 'bg-white' : 'bg-zinc-700',
            ].join(' ')}
            onPress={onContinue}
            disabled={!canSubmit}
          >
            <Text className={canSubmit ? 'text-black font-semibold' : 'text-zinc-200 font-semibold'}>
              {loading ? 'Saving…' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

