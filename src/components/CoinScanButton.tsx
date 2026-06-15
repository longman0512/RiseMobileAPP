import React from 'react';
import { ActivityIndicator, Platform, Pressable, Text } from 'react-native';
import { Nfc } from 'lucide-react-native';

import { useCoinTap } from '../providers/CoinTapProvider';
import { useSession } from '../providers/SessionProvider';

/**
 * iOS-only floating "Tap your coin" button. Apple cannot listen for NFC tags
 * passively, so iOS users open the system scan sheet via this button. On Android
 * the global passive listener handles taps without any button.
 */
export function CoinScanButton() {
  const { scanCoin, scanning } = useCoinTap();
  const { phase } = useSession();

  if (Platform.OS !== 'ios') return null;
  if (phase !== 'idle') return null;

  return (
    <Pressable
      onPress={scanCoin}
      disabled={scanning}
      className="absolute left-6 right-6 bottom-24 h-14 rounded-2xl bg-white flex-row items-center justify-center"
      style={{ opacity: scanning ? 0.7 : 1 }}
    >
      {scanning ? (
        <ActivityIndicator color="#000000" />
      ) : (
        <>
          <Nfc color="#000000" size={20} />
          <Text className="text-black font-semibold text-base ml-2">Tap your coin</Text>
        </>
      )}
    </Pressable>
  );
}
