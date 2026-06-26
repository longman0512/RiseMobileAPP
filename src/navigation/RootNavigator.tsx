import React from 'react';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthNavigator } from './auth/AuthNavigator';
import { AppTabs } from './tabs/AppTabs';
import { OnboardingNavigator } from './onboarding/OnboardingNavigator';
import { ProtocolNavigator, type ProtocolStackParamList } from './protocol/ProtocolNavigator';
import { useAppBootstrap } from '../hooks/useAppBootstrap';
import { useAuth } from '../providers/AuthProvider';
import { useCoins } from '../providers/CoinsProvider';
import { useOnboardingState } from '../providers/OnboardingStateProvider';

export type OnboardingInitialRoute = 'Permissions' | 'CoinRegistration';

export type RootStackParamList = {
  Auth: { initialRoute?: 'Login' | 'CreateUsername' } | undefined;
  Onboarding: { initialRoute?: OnboardingInitialRoute } | undefined;
  App: undefined;
  Protocol: NavigatorScreenParams<ProtocolStackParamList> | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function resolveOnboardingRoute(): OnboardingInitialRoute {
  return 'Permissions';
}

export function RootNavigator() {
  const { phase } = useAuth();
  const coins = useCoins();
  const onboarding = useOnboardingState();
  const { isBootstrapping, initialBootstrapDone } = useAppBootstrap();

  if (isBootstrapping && !initialBootstrapDone) {
    return null;
  }

  const showOnboarding =
    phase === 'signedIn' && (coins.needsCoinOnboarding || !onboarding.complete);

  const onboardingInitialRoute =
    phase === 'signedIn'
      ? resolveOnboardingRoute()
      : 'Permissions';

  const navigatorKey =
    phase === 'signedIn' ? (showOnboarding ? 'signedIn-onboarding' : 'signedIn-app') : phase;

  return (
    <Stack.Navigator
      key={navigatorKey}
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0C' } }}
    >
      {phase !== 'signedIn' ? (
        <Stack.Screen
          name="Auth"
          component={AuthNavigator}
          initialParams={{ initialRoute: phase === 'needsUsername' ? 'CreateUsername' : 'Login' }}
        />
      ) : showOnboarding ? (
        <Stack.Screen
          name="Onboarding"
          component={OnboardingNavigator}
          initialParams={{ initialRoute: onboardingInitialRoute }}
        />
      ) : (
        <Stack.Screen name="App" component={AppTabs} />
      )}

      <Stack.Screen
        name="Protocol"
        component={ProtocolNavigator}
        options={{ presentation: 'fullScreenModal' }}
      />
    </Stack.Navigator>
  );
}
