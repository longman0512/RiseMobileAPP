import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { CoinRegistrationScreen } from '../../screens/onboarding/CoinRegistrationScreen';
import { FocusSetupScreen } from '../../screens/onboarding/FocusSetupScreen';
import { PermissionsScreen } from '../../screens/onboarding/PermissionsScreen';
import { PriorityContactsScreen } from '../../screens/onboarding/PriorityContactsScreen';
import type { RootStackParamList } from '../RootNavigator';

/** Orphan routes kept for legacy screens not registered in the navigator. */
export type OnboardingStackParamList = {
  Permissions: undefined;
  CoinRegistration: undefined;
  FocusSetup: undefined;
  PriorityContacts: undefined;
  Scanning: undefined;
  Pairing: undefined;
  DeviceNaming: undefined;
  Activation: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export function OnboardingNavigator({ route }: Props) {
  return (
    <Stack.Navigator
      initialRouteName={route.params?.initialRoute ?? 'CoinRegistration'}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="CoinRegistration" component={CoinRegistrationScreen} />
      <Stack.Screen name="FocusSetup" component={FocusSetupScreen} />
      <Stack.Screen name="Permissions" component={PermissionsScreen} />
      <Stack.Screen name="PriorityContacts" component={PriorityContactsScreen} />
    </Stack.Navigator>
  );
}
