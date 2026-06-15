import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Clock, Settings } from 'lucide-react-native';

import { CoinScanButton } from '../../components/CoinScanButton';
import { HistoryScreen } from '../../screens/history/HistoryScreen';
import { SettingsScreen } from '../../screens/app/SettingsScreen';

export type AppTabsParamList = {
  History: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<AppTabsParamList>();

function TabIcon({
  focused,
  Icon,
  label,
}: {
  focused: boolean;
  Icon: typeof Clock;
  label: string;
}) {
  return (
    <View className="items-center justify-center pt-1 min-w-[72px]">
      {focused ? (
        <View className="absolute -top-3 h-1 w-16 rounded-full bg-zinc-400" />
      ) : null}
      <Icon color={focused ? '#e4e4e7' : '#71717a'} size={24} />
      <Text
        className={[
          'text-xs mt-1',
          focused ? 'text-zinc-200 font-medium' : 'text-zinc-500',
        ].join(' ')}
      >
        {label}
      </Text>
    </View>
  );
}

export function AppTabs() {
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: {
            backgroundColor: '#0D0D0D',
            borderTopColor: 'rgba(255,255,255,0.05)',
            borderTopWidth: 1,
            height: 72,
            paddingTop: 8,
            paddingBottom: 10,
          },
        }}
      >
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon focused={focused} Icon={Clock} label="History" />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon focused={focused} Icon={Settings} label="Settings" />
            ),
          }}
        />
      </Tab.Navigator>
      <CoinScanButton />
    </View>
  );
}
