import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';

import { useAppBootstrap } from '../hooks/useAppBootstrap';
import { flushPendingProtocolNavigation, navigationRef } from '../lib/navigationRef';
import { RootNavigator } from '../navigation/RootNavigator';
import { DevCoinSimulator } from './DevCoinSimulator';
import { SplashScreen } from '../screens/common/SplashScreen';

export function AppShell() {
  const { showSplash } = useAppBootstrap();

  return (
    <View style={styles.root}>
      <NavigationContainer ref={navigationRef} onReady={flushPendingProtocolNavigation}>
        <RootNavigator />
      </NavigationContainer>
      <View pointerEvents="box-none" style={styles.devSimulator}>
        <DevCoinSimulator compact />
      </View>
      {showSplash ? <SplashScreen /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  devSimulator: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 100,
    zIndex: 20,
  },
});
