import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { DashboardScreen } from '../../screens/app/DashboardScreen';
import { HistoryScreen } from '../../screens/history/HistoryScreen';
import { SettingsScreen } from '../../screens/app/SettingsScreen';

export type AppTabsParamList = {
  Focus: undefined;
  Journey: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<AppTabsParamList>();

function FocusTabIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <View style={[styles.roundIcon, focused ? styles.iconActive : styles.iconIdle]} />
      <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : styles.tabLabelIdle]}>Focus</Text>
    </View>
  );
}

function JourneyTabIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <View style={styles.barsIcon}>
        <View style={[styles.bar, styles.barFull, focused ? styles.iconActiveBar : styles.iconIdleBar]} />
        <View style={[styles.bar, styles.barShort, focused ? styles.iconActiveBar : styles.iconIdleBar]} />
        <View style={[styles.bar, styles.barMid, focused ? styles.iconActiveBar : styles.iconIdleBar]} />
      </View>
      <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : styles.tabLabelIdle]}>Journey</Text>
    </View>
  );
}

function SettingsTabIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <View style={[styles.squareIcon, focused ? styles.iconActive : styles.iconIdle]} />
      <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : styles.tabLabelIdle]}>Settings</Text>
    </View>
  );
}

export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: 'rgba(10,10,12,0.9)',
          borderTopColor: '#222228',
          borderTopWidth: 1,
          height: 84,
          paddingTop: 14,
          paddingBottom: 28,
        },
      }}
    >
      <Tab.Screen
        name="Focus"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ focused }) => <FocusTabIcon focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Journey"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ focused }) => <JourneyTabIcon focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => <SettingsTabIcon focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    alignItems: 'center',
    gap: 5,
    minWidth: 72,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  tabLabelActive: {
    color: '#F5F5F7',
  },
  tabLabelIdle: {
    color: '#5C5C66',
  },
  roundIcon: {
    borderRadius: 9999,
    borderWidth: 1.5,
    height: 22,
    width: 22,
  },
  squareIcon: {
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    width: 22,
  },
  iconActive: {
    borderColor: '#F5F5F7',
  },
  iconIdle: {
    borderColor: '#5C5C66',
  },
  barsIcon: {
    gap: 3,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  bar: {
    borderRadius: 2,
    height: 1.5,
  },
  barFull: {
    width: 22,
  },
  barShort: {
    width: 14,
  },
  barMid: {
    width: 18,
  },
  iconActiveBar: {
    backgroundColor: '#F5F5F7',
  },
  iconIdleBar: {
    backgroundColor: '#5C5C66',
  },
});
