import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { OnboardingStackParamList } from '../../navigation/onboarding/OnboardingNavigator';

export function PairingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const [loading, setLoading] = useState(false);

  const onPair = async () => {
    setLoading(true);
    try {
      await AsyncStorage.setItem('devicePaired', 'true');
      await AsyncStorage.setItem('deviceId', 'RISE-4A7B');
      navigation.replace('DeviceNaming');
    } catch {
      Alert.alert('Pairing failed', 'Could not save device pairing.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#0A0A0C] px-6">
      <View className="flex-1 justify-center">
        <Text className="text-white text-3xl font-bold text-center">Pairing</Text>
        <Text className="text-zinc-400 text-center mt-2">Pair your RISE bottle to continue.</Text>

        <Pressable
          className="mt-10 h-12 rounded-xl bg-white items-center justify-center"
          onPress={onPair}
          disabled={loading}
        >
          <Text className="text-black font-semibold">{loading ? 'Pairing…' : 'Pair device'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

