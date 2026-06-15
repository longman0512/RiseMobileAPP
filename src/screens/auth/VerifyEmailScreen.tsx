import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { AuthStackParamList } from '../../navigation/auth/AuthNavigator';

export function VerifyEmailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  return (
    <View className="flex-1 bg-black px-6">
      <View className="flex-1 justify-center items-center">
        <Text className="text-white text-3xl font-bold text-center">Check your inbox</Text>
        <Text className="text-zinc-400 text-center mt-3">
          We sent you a verification link. Open it, then come back and log in.
        </Text>

        <Pressable
          className="mt-10 h-12 px-6 rounded-xl bg-white items-center justify-center"
          onPress={() => navigation.popToTop()}
        >
          <Text className="text-black font-semibold">Back to login</Text>
        </Pressable>
      </View>
    </View>
  );
}

