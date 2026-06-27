import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { onboardingStyles, setupEyebrow } from './onboardingLayout';

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
  const insets = useSafeAreaInsets();
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
  const canAdvanceCurrent = !currentIos.requiresPicker || selections[currentIos.protocol];
  const isLastStep = iosStep === IOS_BLOCKING_STEPS.length - 1;

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

  const onSkip = () => {
    navigation.navigate('MusicPicker');
  };

  const onChooseApps = async (protocol: CoinType) => {
    setBusy(true);
    try {
      let isAuthorizedNow = authorized;
      if (!isAuthorizedNow) {
        isAuthorizedNow = await requestFocusModeAuthorization();
        setAuthorized(isAuthorizedNow);
      }
      if (!isAuthorizedNow) {
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

  const renderFooterPrimary = () => {
    if (!isIos) {
      return (
        <Pressable style={onboardingStyles.continueButton} onPress={onContinue}>
          <Text style={onboardingStyles.continueText}>Continue</Text>
        </Pressable>
      );
    }

    if (!isLastStep) {
      return (
        <Pressable
          style={[onboardingStyles.continueButton, !canAdvanceCurrent ? onboardingStyles.continueButtonDisabled : null]}
          onPress={() => setIosStep((s) => s + 1)}
          disabled={!canAdvanceCurrent}
        >
          <Text
            style={[
              onboardingStyles.continueText,
              !canAdvanceCurrent ? onboardingStyles.continueTextDisabled : null,
            ]}
          >
            Next mode
          </Text>
        </Pressable>
      );
    }

    return (
      <Pressable
        style={[onboardingStyles.continueButton, !allIosReady ? onboardingStyles.continueButtonDisabled : null]}
        onPress={onContinue}
        disabled={!allIosReady}
      >
        <Text style={[onboardingStyles.continueText, !allIosReady ? onboardingStyles.continueTextDisabled : null]}>
          Continue
        </Text>
      </Pressable>
    );
  };

  const heroTitle = isIos ? currentIos.title : 'Focus & apps';
  const heroSubtitle = isIos
    ? currentIos.description
    : 'Set up app limits so FLOW stays filtered, not fully blocked.';

  return (
    <View style={onboardingStyles.root}>
      <View style={[onboardingStyles.content, { paddingTop: insets.top + 18 }]}>
        <View style={onboardingStyles.hero}>
          <Text style={onboardingStyles.eyebrow}>{setupEyebrow(2)}</Text>
          {isIos ? (
            <Text style={styles.modeLabel}>
              Mode {iosStep + 1} of {IOS_BLOCKING_STEPS.length}
            </Text>
          ) : null}
          <Text style={onboardingStyles.title}>{heroTitle}</Text>
          <Text style={onboardingStyles.subtitle}>{heroSubtitle}</Text>
        </View>

        {isIos ? (
          <View style={styles.hintBox}>
            {currentIos.requiresPicker ? (
              <>
                <Pressable
                  style={[
                    styles.actionButton,
                    selections[currentIos.protocol] ? styles.actionButtonDone : null,
                  ]}
                  onPress={() => onChooseApps(currentIos.protocol)}
                  disabled={busy}
                >
                  <Text
                    style={[
                      styles.actionButtonText,
                      selections[currentIos.protocol] ? styles.actionButtonTextDone : null,
                    ]}
                  >
                    {busy ? 'Opening...' : currentIos.pickerLabel}
                  </Text>
                </Pressable>
                <Text style={styles.statusText}>
                  {selections[currentIos.protocol] ? 'Configured' : 'Not configured yet'}
                </Text>
              </>
            ) : (
              <Text style={styles.hintCopy}>No app picker is needed for RESET.</Text>
            )}
          </View>
        ) : (
          <View style={[styles.hintBox, styles.hintBoxRow]}>
            <View style={styles.hintIcon}>
              <View style={styles.hintRingOuter} />
              <View style={styles.hintRingInner} />
            </View>
            <View style={styles.hintBody}>
              {ANDROID_BULLETS.map((line) => (
                <Text key={line} style={styles.hintCopy}>
                  - {line}
                </Text>
              ))}
            </View>
          </View>
        )}
      </View>

      <View style={onboardingStyles.footer}>
        {renderFooterPrimary()}
        <Pressable style={onboardingStyles.skipButton} onPress={onSkip}>
          <Text style={onboardingStyles.skipText}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modeLabel: {
    color: '#5C5C66',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginTop: 10,
    textAlign: 'left',
    textTransform: 'uppercase',
  },
  hintBox: {
    alignItems: 'stretch',
    borderColor: '#2E2E36',
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  hintBoxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  hintIcon: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: '#9A9AA2',
    borderRadius: 19,
    borderWidth: 1.5,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  hintRingOuter: {
    borderColor: 'rgba(92,92,102,0.25)',
    borderRadius: 33,
    borderWidth: 1,
    height: 66,
    position: 'absolute',
    width: 66,
  },
  hintRingInner: {
    borderColor: 'rgba(92,92,102,0.5)',
    borderRadius: 26,
    borderWidth: 1,
    height: 52,
    position: 'absolute',
    width: 52,
  },
  hintBody: {
    flex: 1,
    gap: 6,
  },
  hintCopy: {
    color: '#9A9AA2',
    fontSize: 12.5,
    fontWeight: '300',
    lineHeight: 20,
    textAlign: 'left',
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
  },
  actionButtonDone: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: '#22C55E',
    borderWidth: 1,
  },
  actionButtonText: {
    color: '#0A0A0C',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonTextDone: {
    color: '#22C55E',
  },
  statusText: {
    color: '#5C5C66',
    fontSize: 11,
    fontWeight: '300',
    textAlign: 'left',
  },
});
