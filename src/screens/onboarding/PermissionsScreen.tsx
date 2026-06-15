import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Bell, ScanLine } from 'lucide-react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { OnboardingStackParamList } from '../../navigation/onboarding/OnboardingNavigator';
import { requestNfcAndNotifications } from '../../lib/permissions';
export function PermissionsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();

  const [nfcGranted, setNfcGranted] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [loading, setLoading] = useState(false);

  const requestPermissions = async () => {
    setLoading(true);
    try {
      const { nfc, notifications } = await requestNfcAndNotifications();
      setNfcGranted(nfc);
      setNotificationsGranted(notifications);

      if (!nfc || !notifications) {
        const missing: string[] = [];
        if (!nfc) missing.push('NFC');
        if (!notifications) missing.push('Notifications');
        Alert.alert(
          'Permissions',
          `${missing.join(' and ')} ${missing.length === 1 ? 'was' : 'were'} not granted. You can enable them later in Settings.`,
        );
      }
    } catch {
      Alert.alert('Permissions', 'Failed to request permissions.');
    } finally {
      setLoading(false);
    }
  };

  const onContinue = async () => {
    navigation.navigate('CoinRegistration');
  };

  return (
    <View className="flex-1 bg-[#0D0D0D] px-6 py-10">
      <View className="flex-1 justify-center">
        <Text className="text-white text-3xl font-bold text-center">Permissions</Text>
        <Text className="text-zinc-400 text-center mt-2">
          NFC and notifications let Rise respond when you tap a coin
        </Text>

        <View className="mt-10 gap-4">
          <View className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
            <View className="flex-row items-start">
              <View
                className={[
                  'w-12 h-12 rounded-full items-center justify-center',
                  nfcGranted ? 'bg-white/10' : 'bg-zinc-800',
                ].join(' ')}
              >
                <ScanLine color={nfcGranted ? '#fff' : '#a1a1aa'} />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-white text-lg font-semibold">NFC</Text>
                <Text className="text-zinc-400 mt-1">Read your coins and open the right protocol</Text>
              </View>
            </View>
          </View>

          <View className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
            <View className="flex-row items-start">
              <View
                className={[
                  'w-12 h-12 rounded-full items-center justify-center',
                  notificationsGranted ? 'bg-white/10' : 'bg-zinc-800',
                ].join(' ')}
              >
                <Bell color={notificationsGranted ? '#fff' : '#a1a1aa'} />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-white text-lg font-semibold">Notifications</Text>
                <Text className="text-zinc-400 mt-1">Session updates while the app runs in background</Text>
              </View>
            </View>
          </View>

          <Pressable
            className="h-11 rounded-xl bg-white items-center justify-center"
            onPress={requestPermissions}
            disabled={loading}
          >
            <Text className="text-black font-semibold">
              {loading ? 'Requesting…' : 'Grant permissions'}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable className="h-14 rounded-2xl bg-white items-center justify-center" onPress={onContinue}>
        <Text className="text-black font-semibold">Continue</Text>
      </Pressable>
    </View>
  );
}
