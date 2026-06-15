import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { setNfcBusy, startNfcListener } from '../../lib/nfc';
import { showErrorToast, showSuccessToast } from '../../lib/toast';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { OnboardingStackParamList } from '../../navigation/onboarding/OnboardingNavigator';
import { useCoins } from '../../providers/CoinsProvider';
import { COIN_LABELS, COIN_TYPES, type CoinType } from '../../types/coins';

type Step = 'intro' | CoinType | 'done';

export function CoinRegistrationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { coins, registerCoin } = useCoins();

  const [step, setStep] = useState<Step>('intro');
  const [listening, setListening] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registeredTypes, setRegisteredTypes] = useState<Set<CoinType>>(() => {
    const initial = new Set<CoinType>();
    for (const c of coins) {
      if (c.active) initial.add(c.coin_type);
    }
    return initial;
  });

  useEffect(() => {
    setRegisteredTypes((prev) => {
      const next = new Set(prev);
      for (const c of coins) {
        if (c.active) next.add(c.coin_type);
      }
      return next;
    });
  }, [coins]);

  const activeCoins = useMemo(() => coins.filter((c) => c.active), [coins]);

  const coinIdForStep =
    step !== 'intro' && step !== 'done'
      ? (activeCoins.find((c) => c.coin_type === step)?.coin_id ?? null)
      : null;

  const stopNfcRef = useRef<(() => void) | null>(null);
  const handlingTagRef = useRef(false);

  const coinStepIndex = step === 'intro' || step === 'done' ? -1 : COIN_TYPES.indexOf(step);
  const registeredCount = registeredTypes.size;

  const title = useMemo(() => {
    if (step === 'intro') return 'Let\u2019s register your coins.';
    if (step === 'done') {
      if (registeredCount === 3) return "Your three coins are registered. You're ready.";
      if (registeredCount === 0) return "You're ready.";
      return `Registered ${registeredCount} of 3 coins. You're ready.`;
    }
    return `Tap your ${COIN_LABELS[step]} coin on the back of your phone.`;
  }, [step, registeredCount]);

  const subtitle = useMemo(() => {
    if (step === 'intro') {
      return 'Register each coin with a quick tap. You can skip any coin you do not have yet.';
    }
    if (step === 'done') return 'You can register more coins later in Settings.';
    if (listening) return 'Listening for NFC…';
    return `Step ${coinStepIndex + 1} of 3`;
  }, [step, listening, coinStepIndex]);

  const handleTag = useCallback(
    async (coinId: string, coinType: CoinType) => {
      if (handlingTagRef.current) return;
      handlingTagRef.current = true;
      setRegistering(true);
      try {
        const result = await registerCoin(coinId, coinType);
        if (!result.ok) {
          showErrorToast('Registration failed', result.message);
          return;
        }
        setRegisteredTypes((prev) => new Set(prev).add(coinType));
        showSuccessToast('Registered', `${COIN_LABELS[coinType]} coin linked to your account.`);

        const idx = COIN_TYPES.indexOf(coinType);
        if (idx < COIN_TYPES.length - 1) {
          setTimeout(() => setStep(COIN_TYPES[idx + 1]), 500);
        } else {
          setTimeout(() => setStep('done'), 500);
        }
      } finally {
        setRegistering(false);
        handlingTagRef.current = false;
      }
    },
    [registerCoin],
  );

  useEffect(() => {
    if (step === 'intro' || step === 'done') {
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
          if (!cancelled && COIN_TYPES.includes(currentStep as CoinType)) {
            void handleTag(coinId, currentStep as CoinType);
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
  }, [step, handleTag]);

  const goNextCoinStep = () => {
    if (step === 'intro') {
      setStep(COIN_TYPES[0]);
      return;
    }
    if (step === 'done') return;
    const idx = COIN_TYPES.indexOf(step);
    if (idx < COIN_TYPES.length - 1) {
      setStep(COIN_TYPES[idx + 1]);
    } else {
      setStep('done');
    }
  };

  const goToFocusSetup = () => {
    navigation.navigate('FocusSetup');
  };

  const onIntroContinue = () => {
    setStep(COIN_TYPES[0]);
  };

  return (
    <View className="flex-1 bg-black px-6">
      <View className="flex-1 justify-center">
        {step !== 'intro' && step !== 'done' && (
          <View className="flex-row justify-center gap-2 mb-8">
            {COIN_TYPES.map((type) => {
              const done = registeredTypes.has(type);
              const active = type === step;
              return (
                <View
                  key={type}
                  className={[
                    'h-2 flex-1 rounded-full',
                    done ? 'bg-white' : active ? 'bg-zinc-400' : 'bg-zinc-800',
                  ].join(' ')}
                  accessibilityLabel={`${COIN_LABELS[type]}${done ? ' registered' : ''}`}
                />
              );
            })}
          </View>
        )}

        <Text className="text-white text-3xl font-bold text-center">{title}</Text>
        <Text className="text-zinc-400 text-center mt-3 leading-6">{subtitle}</Text>

        {step === 'intro' && activeCoins.length > 0 ? (
          <View className="mt-8 gap-3 w-full">
            {activeCoins.map((coin) => (
              <View
                key={coin.coin_id}
                className="rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3"
              >
                <Text className="text-zinc-400 text-sm">{COIN_LABELS[coin.coin_type]}</Text>
                <Text className="text-zinc-500 text-xs mt-1">your registered coin</Text>
                <Text className="text-white text-xs font-mono mt-2" selectable>
                  {coin.coin_id}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {step !== 'intro' && step !== 'done' && (
          <View className="mt-10 items-center">
            {registeredTypes.has(step) ? (
              <View className="items-center">
                <View className="h-20 w-20 rounded-full bg-white/10 items-center justify-center">
                  <Check size={40} color="#ffffff" strokeWidth={2.5} />
                </View>
                {coinIdForStep ? (
                  <View className="mt-6 items-center px-4">
                    <Text className="text-zinc-500 text-xs">your registered coin</Text>
                    <Text className="text-white text-xs font-mono mt-2 text-center" selectable>
                      {coinIdForStep}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : registering ? (
              <ActivityIndicator size="large" color="#ffffff" />
            ) : (
              <View className="h-20 w-20 rounded-full border-2 border-dashed border-white/30 items-center justify-center">
                <Text className="text-white/50 text-xs text-center px-2">NFC</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View className="pb-10 gap-3">
        {step === 'intro' && (
          <Pressable className="h-12 rounded-xl bg-white items-center justify-center" onPress={onIntroContinue}>
            <Text className="text-black font-semibold">Get started</Text>
          </Pressable>
        )}

        {step !== 'intro' && step !== 'done' && (
          <>
            <Pressable
              className="h-12 rounded-xl bg-white items-center justify-center"
              onPress={goNextCoinStep}
              disabled={registering}
            >
              <Text className="text-black font-semibold">
                {registeredTypes.has(step) ? 'Next coin' : 'Skip this coin'}
              </Text>
            </Pressable>
          </>
        )}

        {step === 'done' && (
          <Pressable className="h-12 rounded-xl bg-white items-center justify-center" onPress={goToFocusSetup}>
            <Text className="text-black font-semibold">Continue</Text>
          </Pressable>
        )}

        {step !== 'intro' && step !== 'done' && (
          <Pressable className="h-12 rounded-xl items-center justify-center" onPress={goToFocusSetup}>
            <Text className="text-zinc-400 font-semibold">Skip remaining setup</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
