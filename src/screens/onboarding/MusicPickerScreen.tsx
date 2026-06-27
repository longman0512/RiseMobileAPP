import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OnboardingStackParamList } from '../../navigation/onboarding/OnboardingNavigator';
import { openFlowPlaylist } from '../../lib/flowMusic';
import { useUserPreferences, type MusicService } from '../../providers/UserPreferencesProvider';
import { onboardingStyles, setupEyebrow } from './onboardingLayout';

const OPTIONS: { id: MusicService; label: string; subtitle: string }[] = [
  { id: 'spotify', label: 'Spotify', subtitle: 'Open FLOW playlist in Spotify' },
  { id: 'apple', label: 'Apple Music', subtitle: 'Open FLOW playlist in Apple Music' },
  { id: 'none', label: 'None', subtitle: 'No music when FLOW starts' },
];

export function MusicPickerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const insets = useSafeAreaInsets();
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
    <View style={onboardingStyles.root}>
      <View style={[onboardingStyles.content, { paddingTop: insets.top + 18 }]}>
        <View style={onboardingStyles.hero}>
          <Text style={onboardingStyles.eyebrow}>{setupEyebrow(3)}</Text>
          <Text style={onboardingStyles.title}>
            FLOW{'\n'}
            <Text style={onboardingStyles.titleLight}>music.</Text>
          </Text>
          <Text style={onboardingStyles.subtitle}>
            Choose a service for the lo-fi / ambient playlist when you start FLOW.
          </Text>
        </View>

        <View style={onboardingStyles.optionList}>
          {OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => setSelected(opt.id)}
              style={[
                onboardingStyles.optionRow,
                selected === opt.id ? onboardingStyles.optionRowSelected : null,
              ]}
            >
              <Text style={onboardingStyles.optionTitle}>{opt.label}</Text>
              <Text style={onboardingStyles.optionSub}>{opt.subtitle}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={onboardingStyles.footer}>
        {selected !== 'none' ? (
          <Pressable style={styles.previewButton} onPress={onPreview}>
            <Text style={styles.previewText}>Preview playlist</Text>
          </Pressable>
        ) : null}
        <Pressable style={onboardingStyles.continueButton} onPress={onContinue}>
          <Text style={onboardingStyles.continueText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  previewButton: {
    alignItems: 'center',
    borderColor: '#2E2E36',
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
  },
  previewText: {
    color: '#F5F5F7',
    fontSize: 14,
    fontWeight: '500',
  },
});
