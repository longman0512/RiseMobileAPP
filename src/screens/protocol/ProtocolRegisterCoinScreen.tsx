import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { ProtocolStackParamList } from '../../navigation/protocol/ProtocolNavigator';
import { resetToApp } from '../../lib/navigationRef';
import { COIN_LABELS } from '../../types/coins';

type Props = NativeStackScreenProps<ProtocolStackParamList, 'RegisterCoin'>;

export function ProtocolRegisterCoinScreen({ route }: Props) {
  const { protocol } = route.params;
  const navigation = useNavigation();

  return (
    <View className="flex-1 bg-[#0A0A0C] px-6 py-16 justify-center">
      <Text className="text-white text-2xl font-bold text-center">Register this coin first</Text>
      <Text className="text-zinc-400 text-center mt-4">
        Link your {COIN_LABELS[protocol]} coin in Settings before starting a session.
      </Text>

      <Pressable
        className="mt-10 h-14 rounded-2xl bg-white items-center justify-center"
        onPress={() => resetToApp()}
      >
        <Text className="text-black font-semibold">Go to Settings</Text>
      </Pressable>

      <Pressable className="mt-4 h-12 items-center justify-center" onPress={() => navigation.goBack()}>
        <Text className="text-zinc-500">Back</Text>
      </Pressable>
    </View>
  );
}
