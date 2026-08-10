import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DevCoinSimulator } from '../../components/DevCoinSimulator';
import { ProtocolActiveScreen } from '../../screens/protocol/ProtocolActiveScreen';
import { ProtocolBreatheScreen } from '../../screens/protocol/ProtocolBreatheScreen';
import { ProtocolCloseoutScreen } from '../../screens/protocol/ProtocolCloseoutScreen';
import { ProtocolEndShiftScreen } from '../../screens/protocol/ProtocolEndShiftScreen';
import { ProtocolFinaleScreen } from '../../screens/protocol/ProtocolFinaleScreen';
import { ProtocolPreStartScreen } from '../../screens/protocol/ProtocolPreStartScreen';
import { ProtocolRegisterCoinScreen } from '../../screens/protocol/ProtocolRegisterCoinScreen';
import { ProtocolResetChoiceScreen } from '../../screens/protocol/ProtocolResetChoiceScreen';
import { ProtocolTirednessScreen } from '../../screens/protocol/ProtocolTirednessScreen';
import type { CoinType } from '../../types/coins';

export type ProtocolStackParamList = {
  PreStart: { protocol: CoinType };
  Active: { protocol: CoinType };
  ResetChoice: undefined;
  Tiredness: undefined;
  Closeout: undefined;
  Breathe: undefined;
  EndShift: undefined;
  Finale: undefined;
  RegisterCoin: { protocol: CoinType };
};

const Stack = createNativeStackNavigator<ProtocolStackParamList>();

export function ProtocolNavigator() {
  return (
    <View style={styles.root}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="PreStart" component={ProtocolPreStartScreen} />
        <Stack.Screen name="Active" component={ProtocolActiveScreen} />
        <Stack.Screen name="ResetChoice" component={ProtocolResetChoiceScreen} />
        <Stack.Screen name="Tiredness" component={ProtocolTirednessScreen} />
        <Stack.Screen name="Closeout" component={ProtocolCloseoutScreen} />
        <Stack.Screen name="Breathe" component={ProtocolBreatheScreen} />
        <Stack.Screen name="EndShift" component={ProtocolEndShiftScreen} />
        <Stack.Screen name="Finale" component={ProtocolFinaleScreen} />
        <Stack.Screen name="RegisterCoin" component={ProtocolRegisterCoinScreen} />
      </Stack.Navigator>
      {/* This stack is presented as a native modal over the app root, so the
          simulator in AppShell is hidden behind it. Render it here too, or the
          coin buttons vanish exactly when a shift is running. */}
      <View pointerEvents="box-none" style={styles.devSimulator}>
        <DevCoinSimulator compact />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A0A0C',
    flex: 1,
  },
  devSimulator: {
    bottom: 28,
    left: 16,
    position: 'absolute',
    right: 16,
    zIndex: 20,
  },
});
