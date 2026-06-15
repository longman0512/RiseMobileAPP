import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { LoginScreen } from '../../screens/auth/LoginScreen';
import { SignupScreen } from '../../screens/auth/SignupScreen';
import { VerifyEmailScreen } from '../../screens/auth/VerifyEmailScreen';
import { CreateUsernameScreen } from '../../screens/auth/CreateUsernameScreen';
import type { RootStackParamList } from '../RootNavigator';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  VerifyEmail: undefined;
  CreateUsername: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

export function AuthNavigator({ route }: Props) {
  return (
    <Stack.Navigator
      initialRouteName={route.params?.initialRoute ?? 'Login'}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ keyboardHandlingEnabled: true }}
      />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="CreateUsername" component={CreateUsernameScreen} />
    </Stack.Navigator>
  );
}

