import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { COIN_LABELS, type CoinType } from '../types/coins';

type Props = {
  visible: boolean;
  protocol: CoinType | null;
  onContinue: () => void;
  onEndSession: () => void;
};

export function SessionResumeOverlay({ visible, protocol, onContinue, onEndSession }: Props) {
  if (!protocol) return null;

  const label = COIN_LABELS[protocol];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onContinue}>
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: 'rgba(10,10,12,0.85)' }}>
        <View className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-900 px-6 py-8">
          <Text className="text-white text-xl font-bold text-center">Still in {label}</Text>
          <Text className="text-zinc-400 text-center mt-3 text-sm leading-5">
            Your session is still running. End it or continue where you left off.
          </Text>

          <Pressable
            className="mt-8 h-12 rounded-xl bg-white items-center justify-center"
            onPress={onEndSession}
          >
            <Text className="text-black font-semibold">End session</Text>
          </Pressable>

          <Pressable className="mt-3 h-12 rounded-xl items-center justify-center" onPress={onContinue}>
            <Text className="text-white font-semibold">Continue</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
