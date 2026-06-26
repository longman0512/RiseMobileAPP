import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

export function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-[#0A0A0C]">
      <ActivityIndicator />
      <Text className="text-zinc-400 mt-3">Loading…</Text>
    </View>
  );
}

