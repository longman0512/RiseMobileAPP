import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { CoinRegistrationScreen } from '../../screens/onboarding/CoinRegistrationScreen';
import { FocusSetupScreen } from '../../screens/onboarding/FocusSetupScreen';
import { MusicPickerScreen } from '../../screens/onboarding/MusicPickerScreen';
import { PermissionsScreen } from '../../screens/onboarding/PermissionsScreen';
import { PriorityContactsScreen } from '../../screens/onboarding/PriorityContactsScreen';
import type { RootStackParamList } from '../RootNavigator';

/** Orphan routes kept for legacy screens not registered in the navigator. */
export type OnboardingStackParamList = {
  Permissions: undefined;
  CoinRegistration: undefined;
  FocusSetup: undefined;
  MusicPicker: undefined;
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
      initialRouteName={route.params?.initialRoute ?? 'Permissions'}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Permissions" component={PermissionsScreen} />
      <Stack.Screen name="CoinRegistration" component={CoinRegistrationScreen} />
      <Stack.Screen name="FocusSetup" component={FocusSetupScreen} />
      <Stack.Screen name="MusicPicker" component={MusicPickerScreen} />
      <Stack.Screen name="PriorityContacts" component={PriorityContactsScreen} />
    </Stack.Navigator>
  );
}
