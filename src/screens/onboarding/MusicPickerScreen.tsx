import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { OnboardingStackParamList } from '../../navigation/onboarding/OnboardingNavigator';
import { openFlowPlaylist } from '../../lib/flowMusic';
import { useUserPreferences, type MusicService } from '../../providers/UserPreferencesProvider';

const OPTIONS: { id: MusicService; label: string; subtitle: string }[] = [
  { id: 'spotify', label: 'Spotify', subtitle: 'Open FLOW playlist in Spotify' },
  { id: 'apple', label: 'Apple Music', subtitle: 'Open FLOW playlist in Apple Music' },
  { id: 'none', label: 'None', subtitle: 'No music when FLOW starts' },
];

export function MusicPickerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { musicService, setMusicService } = useUserPreferences();
  const [selected, setSelected] = useState<MusicService>(musicService);

  const onContinue = async () => {
    await setMusicService(selected);
    navigation.navigate('PriorityContacts');
  };

  const onPreview = () => {
    void openFlowPlaylist(selected);
  };

  return (
    <View className="flex-1 bg-[#0A0A0C] px-6 py-10">
      <View className="flex-1 justify-center">
        <Text className="text-white text-3xl font-bold text-center">FLOW music</Text>
        <Text className="text-zinc-400 text-center mt-3 leading-6">
          Choose a service for the lo-fi / ambient playlist when you start FLOW.
        </Text>
        <View className="mt-10 gap-3">
          {OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => setSelected(opt.id)}
              className={[
                'rounded-xl border px-4 py-4',
                selected === opt.id ? 'border-white bg-white/10' : 'border-white/15',
              ].join(' ')}
            >
              <Text className="text-white font-semibold">{opt.label}</Text>
              <Text className="text-zinc-500 text-sm mt-1">{opt.subtitle}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View className="pb-10 gap-3">
        {selected !== 'none' ? (
          <Pressable
            className="h-12 rounded-xl border border-white/20 items-center justify-center"
            onPress={onPreview}
          >
            <Text className="text-white font-medium">Preview playlist</Text>
          </Pressable>
        ) : null}
        <Pressable className="h-12 rounded-xl bg-white items-center justify-center" onPress={onContinue}>
          <Text className="text-black font-semibold">Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}
