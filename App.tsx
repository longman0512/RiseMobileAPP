import React, { useEffect, useState } from 'react';
import { StatusBar, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShell } from './src/components/AppShell';
import { AppToast } from './src/components/AppToast';
import { isSupabaseConfigured } from './src/config/env';
import { EnvSetupScreen } from './src/screens/common/EnvSetupScreen';
import { SplashScreen } from './src/screens/common/SplashScreen';
import { BackgroundSessionProvider } from './src/providers/BackgroundSessionProvider';
import { AuthProvider } from './src/providers/AuthProvider';
import { AuthDeepLinkHandler } from './src/providers/AuthDeepLinkHandler';
import { ActivationProvider } from './src/providers/ActivationProvider';
import { CoinsProvider } from './src/providers/CoinsProvider';
import { CoinTapProvider } from './src/providers/CoinTapProvider';
import { OnboardingStateProvider } from './src/providers/OnboardingStateProvider';
import { ProtocolDeepLinkHandler } from './src/providers/ProtocolDeepLinkHandler';
import { SessionProvider } from './src/providers/SessionProvider';
import { SquadProvider } from './src/providers/SquadProvider';
import { UserPreferencesProvider } from './src/providers/UserPreferencesProvider';

function EnvSetupWithSplash() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <EnvSetupScreen />
      {showSplash ? <SplashScreen /> : null}
    </View>
  );
}

export default function App() {
  if (!isSupabaseConfigured()) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />
          <EnvSetupWithSplash />
          <AppToast />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />
        <AuthProvider>
          <AuthDeepLinkHandler />
          <CoinsProvider>
            <SquadProvider>
              <UserPreferencesProvider>
                <SessionProvider>
                  <BackgroundSessionProvider>
                    <ActivationProvider>
                      <OnboardingStateProvider>
                        <CoinTapProvider>
                          <ProtocolDeepLinkHandler />
                          <AppShell />
                        </CoinTapProvider>
                      </OnboardingStateProvider>
                    </ActivationProvider>
                  </BackgroundSessionProvider>
                </SessionProvider>
              </UserPreferencesProvider>
            </SquadProvider>
          </CoinsProvider>
        </AuthProvider>
        <AppToast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
