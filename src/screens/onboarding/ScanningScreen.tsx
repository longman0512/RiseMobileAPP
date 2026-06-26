import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { OnboardingStackParamList } from '../../navigation/onboarding/OnboardingNavigator';

export function ScanningScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const [scanning, setScanning] = useState(true);
  const [deviceFound, setDeviceFound] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDeviceFound(true);
      setScanning(false);
      setTimeout(() => navigation.replace('Pairing'), 900);
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View className="flex-1 bg-[#0A0A0C] items-center justify-center px-6">
      <View className="items-center">
        <View className="w-40 h-40 rounded-full border border-white/10 items-center justify-center">
          <View className={deviceFound ? 'w-20 h-20 rounded-full bg-white' : 'w-20 h-20 rounded-full bg-white/20'} />
        </View>
        <Text className="text-white text-2xl font-bold mt-10">
          {scanning ? 'Scanning…' : 'Device Found!'}
        </Text>
        <Text className="text-zinc-400 mt-2">
          {scanning ? 'Looking for your RISE bottle' : 'RISE Bottle #4A7B'}
        </Text>
      </View>
    </View>
  );
}

