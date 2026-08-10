import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBlockPickerModal } from '../../components/AppBlockPickerModal';
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

const BLOCKING_STEPS: BlockingStep[] = [
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

export function FocusSetupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const insets = useSafeAreaInsets();
  const { setFocusSetupComplete } = useUserPreferences();
  const isAndroid = Platform.OS === 'android';
  const [step, setStep] = useState(0);
  const [authorized, setAuthorized] = useState(false);
  const [selections, setSelections] = useState<Record<CoinType, boolean>>({
    lockin: false,
    flow: false,
    reset: true,
  });
  const [busy, setBusy] = useState(false);
  const [pickerProtocol, setPickerProtocol] = useState<CoinType | null>(null);

  const current = BLOCKING_STEPS[step];
  const allReady = authorized && selections.lockin && selections.flow;
  const canAdvanceCurrent = !current.requiresPicker || selections[current.protocol];
  const isLastStep = step === BLOCKING_STEPS.length - 1;

  const refreshState = useCallback(async () => {
    const [isAuthorized, lockin, flow] = await Promise.all([
      isFocusModeAuthorized(),
      hasFocusModeSelection('lockin'),
      hasFocusModeSelection('flow'),
    ]);
    setAuthorized(isAuthorized);
    setSelections({ lockin, flow, reset: true });
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await refreshState();
      if (!mounted) return;
    })();
    return () => {
      mounted = false;
    };
  }, [refreshState]);

  // Re-check authorization/selection when returning to the app (e.g. after
  // enabling the Accessibility service in Android system settings).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshState();
    });
    return () => sub.remove();
  }, [refreshState]);

  const onContinue = async () => {
    await setFocusSetupComplete(true);
    navigation.navigate('PriorityContacts');
  };

  const onSkip = () => {
    navigation.navigate('PriorityContacts');
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
        // On Android this opens the Accessibility settings; the user grants
        // access and the picker becomes available on their next tap.
        showFocusModeSetupUnavailableAlert('authorization');
        return;
      }

      if (isAndroid) {
        setPickerProtocol(protocol);
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

  const onPickerClose = (protocol: CoinType, saved: boolean) => {
    setPickerProtocol(null);
    setSelections((prev) => ({ ...prev, [protocol]: saved }));
  };

  const renderFooterPrimary = () => {
    if (!isLastStep) {
      return (
        <Pressable
          style={[onboardingStyles.continueButton, !canAdvanceCurrent ? onboardingStyles.continueButtonDisabled : null]}
          onPress={() => setStep((s) => s + 1)}
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
        style={[onboardingStyles.continueButton, !allReady ? onboardingStyles.continueButtonDisabled : null]}
        onPress={onContinue}
        disabled={!allReady}
      >
        <Text style={[onboardingStyles.continueText, !allReady ? onboardingStyles.continueTextDisabled : null]}>
          Continue
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={onboardingStyles.root}>
      <View style={[onboardingStyles.content, { paddingTop: insets.top + 18 }]}>
        <View style={onboardingStyles.hero}>
          <Text style={onboardingStyles.eyebrow}>{setupEyebrow(2)}</Text>
          <Text style={styles.modeLabel}>
            Mode {step + 1} of {BLOCKING_STEPS.length}
          </Text>
          <Text style={onboardingStyles.title}>{current.title}</Text>
          <Text style={onboardingStyles.subtitle}>{current.description}</Text>
        </View>

        <View style={styles.hintBox}>
          {current.requiresPicker ? (
            <>
              <Pressable
                style={[styles.actionButton, selections[current.protocol] ? styles.actionButtonDone : null]}
                onPress={() => onChooseApps(current.protocol)}
                disabled={busy}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    selections[current.protocol] ? styles.actionButtonTextDone : null,
                  ]}
                >
                  {busy ? 'Opening...' : current.pickerLabel}
                </Text>
              </Pressable>
              <Text style={styles.statusText}>
                {selections[current.protocol] ? 'Configured' : 'Not configured yet'}
              </Text>
              {!authorized ? (
                <Text style={styles.hintCopy}>
                  {isAndroid
                    ? 'You will be asked to enable Rise under Accessibility to allow app blocking.'
                    : 'You will be asked to allow Screen Time access to block apps.'}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.hintCopy}>No app picker is needed for RESET.</Text>
          )}
        </View>
      </View>

      <View style={onboardingStyles.footer}>
        {renderFooterPrimary()}
        <Pressable style={onboardingStyles.skipButton} onPress={onSkip}>
          <Text style={onboardingStyles.skipText}>Skip for now</Text>
        </Pressable>
      </View>

      {isAndroid && pickerProtocol ? (
        <AppBlockPickerModal
          visible
          protocol={pickerProtocol}
          onClose={(saved) => onPickerClose(pickerProtocol, saved)}
        />
      ) : null}
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
