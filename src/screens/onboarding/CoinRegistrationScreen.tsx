import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';

import { setNfcBusy, startNfcListener } from '../../lib/nfc';
import { suppressProtocolDeepLinks } from '../../lib/protocolDeepLink';
import { showErrorToast, showSuccessToast } from '../../lib/toast';
import type { OnboardingStackParamList } from '../../navigation/onboarding/OnboardingNavigator';
import { useCoins } from '../../providers/CoinsProvider';
import { COIN_LABELS, COIN_TYPES, type CoinType } from '../../types/coins';
import { onboardingStyles, setupEyebrow } from './onboardingLayout';

type Step = CoinType | 'done';

const COIN_META: Record<CoinType, { detail: string; colors: [string, string, string]; accent: string }> = {
  lockin: {
    detail: 'Brushed steel · Deep focus',
    colors: ['#D7DBE0', '#9BA1A9', '#6F757D'],
    accent: '#C0C4CC',
  },
  flow: {
    detail: 'Polished brass · Creative focus',
    colors: ['#F0D88A', '#C9A24B', '#8F6F2B'],
    accent: '#E8C56A',
  },
  reset: {
    detail: 'Matte copper · Recovery',
    colors: ['#E09A6B', '#C0703F', '#82471F'],
    accent: '#D4855A',
  },
};

function getRegisteredTypes(coins: ReturnType<typeof useCoins>['coins']) {
  const registered = new Set<CoinType>();
  for (const coin of coins) {
    if (coin.active) registered.add(coin.coin_type);
  }
  return registered;
}

function getFirstPendingType(registeredTypes: Set<CoinType>): Step {
  return COIN_TYPES.find((type) => !registeredTypes.has(type)) ?? 'done';
}

export function CoinRegistrationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const insets = useSafeAreaInsets();
  const { coins, registerCoin } = useCoins();

  const [registeredTypes, setRegisteredTypes] = useState<Set<CoinType>>(() => getRegisteredTypes(coins));
  const [step, setStep] = useState<Step>(() => getFirstPendingType(getRegisteredTypes(coins)));
  const [, setListening] = useState(false);
  const [registering, setRegistering] = useState(false);
  // Bumped to re-arm the (one-shot on iOS) NFC scan session after a failed read
  // or registration error, and when the user taps "Scan again". Without this the
  // iOS scan sheet closes after one tap and never reopens for the same step.
  const [rescanToken, setRescanToken] = useState(0);
  const rescan = useCallback(() => setRescanToken((t) => t + 1), []);

  const stopNfcRef = useRef<(() => void) | null>(null);
  const handlingTagRef = useRef(false);

  const registeredCount = registeredTypes.size;
  const allRegistered = registeredCount === COIN_TYPES.length;
  const currentCoinType = step === 'done' ? getFirstPendingType(registeredTypes) : step;
  const currentLabel = currentCoinType === 'done' ? 'coins' : COIN_LABELS[currentCoinType];

  useFocusEffect(
    useCallback(() => {
      // Registration needs the foreground NFC UID scan. Coin Universal Links
      // should not open protocol PreStart while this screen owns the tap.
      return suppressProtocolDeepLinks();
    }, []),
  );

  useEffect(() => {
    const next = getRegisteredTypes(coins);
    setRegisteredTypes(next);
    setStep((current) => {
      if (current !== 'done' && !next.has(current)) return current;
      return getFirstPendingType(next);
    });
  }, [coins]);

  const handleTag = useCallback(
    async (coinId: string, coinType: CoinType) => {
      if (handlingTagRef.current) return;
      handlingTagRef.current = true;
      setRegistering(true);
      try {
        const result = await registerCoin(coinId, coinType);
        if (!result.ok) {
          showErrorToast('Registration failed', result.message);
          // Re-arm the scan so the user can immediately try again (on iOS the
          // one-shot scan sheet has already closed at this point).
          rescan();
          return;
        }

        const next = new Set(registeredTypes).add(coinType);
        setRegisteredTypes(next);
        setStep(getFirstPendingType(next));
        showSuccessToast('Registered', `${COIN_LABELS[coinType]} coin linked to your account.`);
      } finally {
        setRegistering(false);
        handlingTagRef.current = false;
      }
    },
    [registerCoin, registeredTypes, rescan],
  );

  useEffect(() => {
    if (step === 'done' || registeredTypes.has(step)) {
      setListening(false);
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const currentStep = step;
        // Hold the global NFC lock so the live coin-tap listener stands down
        // while onboarding registration owns the NFC session.
        setNfcBusy(true);
        const stop = await startNfcListener((coinId) => {
          if (!cancelled) {
            void handleTag(coinId, currentStep);
          }
        });
        if (cancelled) {
          await stop();
          setNfcBusy(false);
          return;
        }
        stopNfcRef.current = stop;
        setListening(true);
      } catch (e: unknown) {
        setNfcBusy(false);
        const message = e instanceof Error ? e.message : 'NFC is unavailable.';
        showErrorToast('NFC', message);
        setListening(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      setListening(false);
      const stop = stopNfcRef.current;
      stopNfcRef.current = null;
      if (stop) void stop();
      setNfcBusy(false);
    };
  }, [step, registeredTypes, handleTag, rescanToken]);

  const goToFocusSetup = () => {
    navigation.navigate('FocusSetup');
  };

  return (
    <View style={styles.root}>
      <View style={[onboardingStyles.content, { paddingTop: insets.top + 18 }]}>
        <View style={onboardingStyles.hero}>
          <Text style={onboardingStyles.eyebrow}>{setupEyebrow(1)}</Text>
          <Text style={onboardingStyles.title}>
            Pair your{'\n'}
            <Text style={onboardingStyles.titleLight}>coins.</Text>
          </Text>
          <Text style={onboardingStyles.subtitle}>
            Hold each coin against the top of your iPhone. Once registered, a tap is all it takes.
          </Text>
        </View>

        <View style={styles.coinList}>
          {COIN_TYPES.map((type) => {
            const done = registeredTypes.has(type);
            const active = step === type && !done;
            const meta = COIN_META[type];

            return (
              <View
                key={type}
                style={[styles.coinRow, active ? styles.coinRowActive : null]}
                accessibilityLabel={`${COIN_LABELS[type]} ${done ? 'paired' : active ? 'waiting' : 'not paired'}`}
              >
                <LinearGradient colors={meta.colors} style={[styles.coin, !done && !active ? styles.coinDim : null]}>
                  <View style={styles.coinInner} />
                </LinearGradient>
                <View style={styles.coinMeta}>
                  <Text style={styles.coinName}>{COIN_LABELS[type]}</Text>
                  <Text style={styles.coinSub}>{meta.detail}</Text>
                </View>
                <View style={styles.stateWrap}>
                  {done ? (
                    <View style={styles.doneWrap}>
                      <Text style={styles.doneText}>PAIRED</Text>
                      <Check size={12} color="#22C55E" strokeWidth={3} />
                    </View>
                  ) : (
                    <Text style={[styles.waitText, active ? { color: meta.accent } : null]}>
                      {active && registering ? 'PAIRING...' : 'WAITING...'}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.scanHint}>
          <View style={styles.nfcPulse}>
            <View style={styles.nfcRingOuter} />
            <View style={styles.nfcRingInner} />
          </View>
          <Text style={styles.scanCopy}>
            {allRegistered ? (
              'All three coins are paired. Continue to finish setup.'
            ) : (
              <>
                Hold the <Text style={styles.scanStrong}>{currentLabel}</Text> coin near the top edge of your phone.
              </>
            )}
          </Text>
          {registering ? <ActivityIndicator color="#F5F5F7" style={styles.scanSpinner} /> : null}
        </View>

        {!allRegistered && !registering ? (
          <Pressable style={styles.rescanButton} onPress={rescan}>
            <Text style={styles.rescanText}>Scan again</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={onboardingStyles.footer}>
        <Pressable
          style={[onboardingStyles.continueButton, !allRegistered ? onboardingStyles.continueButtonDisabled : null]}
          onPress={goToFocusSetup}
          disabled={!allRegistered}
        >
          <Text style={[onboardingStyles.continueText, !allRegistered ? onboardingStyles.continueTextDisabled : null]}>
            Continue
          </Text>
        </Pressable>
        <Pressable style={onboardingStyles.skipButton} onPress={goToFocusSetup}>
          <Text style={onboardingStyles.skipText}>Pair later</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: onboardingStyles.root,
  coinList: {
    gap: 12,
  },
  coinRow: {
    alignItems: 'center',
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  coinRowActive: {
    borderColor: '#2E2E36',
  },
  coin: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  coinDim: {
    opacity: 0.48,
  },
  coinInner: {
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    width: 32,
  },
  coinMeta: {
    flex: 1,
  },
  coinName: {
    color: '#F5F5F7',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  coinSub: {
    color: '#5C5C66',
    fontSize: 11,
    fontWeight: '300',
    marginTop: 2,
  },
  stateWrap: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  doneWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  doneText: {
    color: '#22C55E',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  waitText: {
    color: '#5C5C66',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  scanHint: {
    alignItems: 'center',
    borderColor: '#2E2E36',
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginTop: 24,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  nfcPulse: {
    alignItems: 'center',
    borderColor: '#9A9AA2',
    borderRadius: 19,
    borderWidth: 1.5,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  nfcRingOuter: {
    borderColor: 'rgba(92,92,102,0.25)',
    borderRadius: 33,
    borderWidth: 1,
    height: 66,
    position: 'absolute',
    width: 66,
  },
  nfcRingInner: {
    borderColor: 'rgba(92,92,102,0.5)',
    borderRadius: 26,
    borderWidth: 1,
    height: 52,
    position: 'absolute',
    width: 52,
  },
  scanCopy: {
    color: '#9A9AA2',
    flex: 1,
    fontSize: 12.5,
    fontWeight: '300',
    lineHeight: 20,
  },
  scanStrong: {
    color: '#F5F5F7',
    fontWeight: '600',
  },
  scanSpinner: {
    marginLeft: 4,
  },
  rescanButton: {
    alignItems: 'center',
    borderColor: '#2E2E36',
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginTop: 16,
  },
  rescanText: {
    color: '#F5F5F7',
    fontSize: 14,
    fontWeight: '500',
  },
});
