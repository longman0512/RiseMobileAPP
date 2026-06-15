import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ProtocolActiveScreen } from '../../screens/protocol/ProtocolActiveScreen';
import { ProtocolJournalScreen } from '../../screens/protocol/ProtocolJournalScreen';
import { ProtocolPreStartScreen } from '../../screens/protocol/ProtocolPreStartScreen';
import { ProtocolRegisterCoinScreen } from '../../screens/protocol/ProtocolRegisterCoinScreen';
import { ProtocolSummaryScreen } from '../../screens/protocol/ProtocolSummaryScreen';
import type { CoinType } from '../../types/coins';

export type ProtocolStackParamList = {
  PreStart: { protocol: CoinType };
  Active: { protocol: CoinType };
  Summary: { protocol: CoinType };
  Journal: { protocol: CoinType };
  RegisterCoin: { protocol: CoinType };
};

const Stack = createNativeStackNavigator<ProtocolStackParamList>();

export function ProtocolNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="PreStart" component={ProtocolPreStartScreen} />
      <Stack.Screen name="Active" component={ProtocolActiveScreen} />
      <Stack.Screen name="Summary" component={ProtocolSummaryScreen} />
      <Stack.Screen name="Journal" component={ProtocolJournalScreen} />
      <Stack.Screen name="RegisterCoin" component={ProtocolRegisterCoinScreen} />
    </Stack.Navigator>
  );
}
