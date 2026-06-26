import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { OnboardingStackParamList } from '../../navigation/onboarding/OnboardingNavigator';
import {
  hasFocusModeSelection,
  isFocusModeAuthorized,
  presentFocusModePicker,
  requestFocusModeAuthorization,
  showFocusModeSetupUnavailableAlert,
} from '../../lib/focusMode';
import { useUserPreferences } from '../../providers/UserPreferencesProvider';
import type { CoinType } from '../../types/coins';

type BlockingStep = {
  protocol: CoinType;
  title: string;
  description: string;
  pickerLabel?: string;
  requiresPicker: boolean;
};

const IOS_BLOCKING_STEPS: BlockingStep[] = [
  {
    protocol: 'lockin',
    title: 'RISE Lock In',
    description:
      'Select social media, YouTube/video, browsers, email, and messaging apps to block during LOCK IN.',
    pickerLabel: 'Choose LOCK IN apps',
    requiresPicker: true,
  },
  {
    protocol: 'flow',
    title: 'RISE Flow',
    description:
      'Select social media, YouTube, Netflix, and other video streaming apps to block during FLOW.',
    pickerLabel: 'Choose FLOW apps',
    requiresPicker: true,
  },
  {
    protocol: 'reset',
    title: 'RISE Reset',
    description:
      'RESET has no app blocking. It clears any active shields so recovery stays lightweight.',
    requiresPicker: false,
  },
];

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
  const [authorized, setAuthorized] = useState(false);
  const [selections, setSelections] = useState<Record<CoinType, boolean>>({
    lockin: false,
    flow: false,
    reset: true,
  });
  const [busy, setBusy] = useState(false);

  const currentIos = IOS_BLOCKING_STEPS[iosStep];
  const allIosReady = authorized && selections.lockin && selections.flow;

  useEffect(() => {
    if (!isIos) return;

    let mounted = true;
    void (async () => {
      const [isAuthorized, lockin, flow] = await Promise.all([
        isFocusModeAuthorized(),
        hasFocusModeSelection('lockin'),
        hasFocusModeSelection('flow'),
      ]);
      if (!mounted) return;
      setAuthorized(isAuthorized);
      setSelections({ lockin, flow, reset: true });
    })();

    return () => {
      mounted = false;
    };
  }, [isIos]);

  const onContinue = async () => {
    await setFocusSetupComplete(true);
    navigation.navigate('MusicPicker');
  };

  const onSkip = async () => {
    navigation.navigate('MusicPicker');
  };

  const onChooseApps = async (protocol: CoinType) => {
    setBusy(true);
    try {
      let isAuthorized = authorized;
      if (!isAuthorized) {
        isAuthorized = await requestFocusModeAuthorization();
        setAuthorized(isAuthorized);
      }
      if (!isAuthorized) {
        showFocusModeSetupUnavailableAlert('authorization');
        return;
      }

      const saved = await presentFocusModePicker(protocol);
      if (saved) {
        setSelections((prev) => ({ ...prev, [protocol]: true }));
      } else {
        showFocusModeSetupUnavailableAlert('picker');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!isIos) {
    return (
      <View className="flex-1 bg-[#0A0A0C] px-6 py-10">
        <View className="flex-1 justify-center">
          <Text className="text-white text-3xl font-bold text-center">Focus &amp; apps</Text>
          <Text className="text-zinc-400 text-center mt-3 leading-6">
            Set up app limits so FLOW stays filtered, not fully blocked.
          </Text>
          <View className="mt-8 gap-2">
            {ANDROID_BULLETS.map((line) => (
              <Text key={line} className="text-zinc-500 text-sm leading-5">
                - {line}
              </Text>
            ))}
          </View>
        </View>
        <View className="pb-10 gap-3">
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
    <View className="flex-1 bg-[#0A0A0C] px-6 py-10">
      <Text className="text-zinc-500 text-center text-sm mb-6">
        Step {iosStep + 1} of {IOS_BLOCKING_STEPS.length}
      </Text>
      <View className="flex-1 justify-center">
        <Text className="text-white text-2xl font-bold text-center">{currentIos.title}</Text>
        <Text className="text-zinc-400 text-sm leading-6 text-center mt-6">
          {currentIos.description}
        </Text>

        {currentIos.requiresPicker ? (
          <>
            <Pressable
              className={[
                'mt-8 h-12 rounded-xl items-center justify-center',
                selections[currentIos.protocol]
                  ? 'border border-emerald-500 bg-emerald-500/10'
                  : 'bg-white',
              ].join(' ')}
              onPress={() => onChooseApps(currentIos.protocol)}
              disabled={busy}
            >
              <Text
                className={
                  selections[currentIos.protocol]
                    ? 'text-emerald-300 font-semibold'
                    : 'text-black font-semibold'
                }
              >
                {busy ? 'Opening...' : currentIos.pickerLabel}
              </Text>
            </Pressable>
            <Text className="text-zinc-500 text-center text-xs mt-3">
              {selections[currentIos.protocol] ? 'Configured' : 'Not configured yet'}
            </Text>
          </>
        ) : (
          <Text className="text-zinc-500 text-center text-xs mt-8">
            No app picker is needed for RESET.
          </Text>
        )}
      </View>
      <View className="pb-10 gap-3">
        {iosStep < IOS_BLOCKING_STEPS.length - 1 ? (
          <Pressable
            className="h-12 rounded-xl bg-white items-center justify-center"
            onPress={() => setIosStep((s) => s + 1)}
            disabled={currentIos.requiresPicker && !selections[currentIos.protocol]}
          >
            <Text
              className={
                !currentIos.requiresPicker || selections[currentIos.protocol]
                  ? 'text-black font-semibold'
                  : 'text-zinc-500 font-semibold'
              }
            >
              Next mode
            </Text>
          </Pressable>
        ) : (
          <Pressable
            className="h-12 rounded-xl bg-white items-center justify-center"
            onPress={onContinue}
            disabled={!allIosReady}
          >
            <Text className={allIosReady ? 'text-black font-semibold' : 'text-zinc-500 font-semibold'}>
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
