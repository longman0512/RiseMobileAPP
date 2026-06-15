import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SessionSetupScreen } from '../../screens/session/SessionSetupScreen';
import { ActiveSessionScreen } from '../../screens/session/ActiveSessionScreen';

export type SessionStackParamList = {
  SessionSetup: undefined;
  SessionActive: { durationMinutes: number };
};

const Stack = createNativeStackNavigator<SessionStackParamList>();

export function SessionNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SessionSetup" component={SessionSetupScreen} />
      <Stack.Screen name="SessionActive" component={ActiveSessionScreen} />
    </Stack.Navigator>
  );
}

