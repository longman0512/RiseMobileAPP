import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { OnboardingStackParamList } from '../../navigation/onboarding/OnboardingNavigator';
import { openFocusSettings } from '../../lib/focusSettings';
import { useUserPreferences } from '../../providers/UserPreferencesProvider';

const IOS_FOCUS_STEPS = [
  {
    title: 'RISE Lock In',
    bullets: [
      'Block social media, YouTube, and Netflix',
      'Allow work and productivity apps',
      'Create a Focus named “RISE Lock In” in Settings',
    ],
  },
  {
    title: 'RISE Flow',
    bullets: [
      'Allow Notes, Notion, and browser',
      'Block social, YouTube, and Netflix',
      'Create a Focus named “RISE Flow” (filtered)',
    ],
  },
  {
    title: 'RISE Reset',
    bullets: [
      'Minimal distractions for recovery',
      'Short breaks away from deep work',
      'Create a Focus named “RISE Reset”',
    ],
  },
] as const;

const ANDROID_BULLETS = [
  'Open Digital Wellbeing or app timers',
  'Set limits on social and video apps',
  'Allow notes and browser during FLOW',
];

export function FocusSetupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { setFocusSetupComplete } = useUserPreferences();
  const isIos = Platform.OS === 'ios';
  const [iosStep, setIosStep] = useState(0);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const currentIos = IOS_FOCUS_STEPS[iosStep];
  const allIosChecked = isIos && IOS_FOCUS_STEPS.every((_, i) => checked[i]);

  const onContinue = async () => {
    await setFocusSetupComplete(true);
    navigation.navigate('MusicPicker');
  };

  const onSkip = async () => {
    navigation.navigate('MusicPicker');
  };

  const toggleCheck = (index: number) => {
    setChecked((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  if (!isIos) {
    return (
      <View className="flex-1 bg-[#0D0D0D] px-6 py-10">
        <View className="flex-1 justify-center">
          <Text className="text-white text-3xl font-bold text-center">Focus &amp; apps</Text>
          <Text className="text-zinc-400 text-center mt-3 leading-6">
            Set up app limits so FLOW stays filtered, not fully blocked.
          </Text>
          <View className="mt-8 gap-2">
            {ANDROID_BULLETS.map((line) => (
              <Text key={line} className="text-zinc-500 text-sm leading-5">
                • {line}
              </Text>
            ))}
          </View>
        </View>
        <View className="pb-10 gap-3">
          <Pressable
            className="h-12 rounded-xl border border-white/20 items-center justify-center"
            onPress={openFocusSettings}
          >
            <Text className="text-white font-medium">Open Settings</Text>
          </Pressable>
          <Pressable className="h-12 rounded-xl bg-white items-center justify-center" onPress={onContinue}>
            <Text className="text-black font-semibold">Continue</Text>
          </Pressable>
          <Pressable className="h-12 items-center justify-center" onPress={onSkip}>
            <Text className="text-zinc-400">Skip for now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0D0D0D] px-6 py-10">
      <Text className="text-zinc-500 text-center text-sm mb-6">
        Step {iosStep + 1} of {IOS_FOCUS_STEPS.length}
      </Text>
      <View className="flex-1 justify-center">
        <Text className="text-white text-2xl font-bold text-center">{currentIos.title}</Text>
        <View className="mt-8 gap-3">
          {currentIos.bullets.map((line) => (
            <Text key={line} className="text-zinc-400 text-sm leading-5 text-center">
              {line}
            </Text>
          ))}
        </View>
        <Pressable
          className="mt-8 flex-row items-center justify-center gap-2"
          onPress={() => toggleCheck(iosStep)}
        >
          <View
            className={[
              'w-5 h-5 rounded border items-center justify-center',
              checked[iosStep] ? 'bg-white border-white' : 'border-zinc-500',
            ].join(' ')}
          >
            {checked[iosStep] ? <Text className="text-black text-xs font-bold">✓</Text> : null}
          </View>
          <Text className="text-zinc-400 text-sm">I&apos;ve set this up</Text>
        </Pressable>
      </View>
      <View className="pb-10 gap-3">
        <Pressable
          className="h-12 rounded-xl border border-white/20 items-center justify-center"
          onPress={openFocusSettings}
        >
          <Text className="text-white font-medium">Open Focus Settings</Text>
        </Pressable>
        {iosStep < IOS_FOCUS_STEPS.length - 1 ? (
          <Pressable
            className="h-12 rounded-xl bg-white items-center justify-center"
            onPress={() => setIosStep((s) => s + 1)}
            disabled={!checked[iosStep]}
          >
            <Text className={checked[iosStep] ? 'text-black font-semibold' : 'text-zinc-500 font-semibold'}>
              Next mode
            </Text>
          </Pressable>
        ) : (
          <Pressable
            className="h-12 rounded-xl bg-white items-center justify-center"
            onPress={onContinue}
            disabled={!allIosChecked}
          >
            <Text className={allIosChecked ? 'text-black font-semibold' : 'text-zinc-500 font-semibold'}>
              Continue
            </Text>
          </Pressable>
        )}
        <Pressable className="h-12 items-center justify-center" onPress={onSkip}>
          <Text className="text-zinc-400">Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}
