import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';

import { useAppBootstrap } from '../hooks/useAppBootstrap';
import { navigationRef } from '../lib/navigationRef';
import { RootNavigator } from '../navigation/RootNavigator';
import { SplashScreen } from '../screens/common/SplashScreen';

export function AppShell() {
  const { showSplash } = useAppBootstrap();

  return (
    <View style={styles.root}>
      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
      </NavigationContainer>
      {showSplash ? <SplashScreen /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
});
