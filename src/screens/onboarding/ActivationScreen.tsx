import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { redeemActivationCode } from '../../lib/activation';
import { useAuth } from '../../providers/AuthProvider';
import { useActivation } from '../../providers/ActivationProvider';
import { useOnboardingState } from '../../providers/OnboardingStateProvider';

export function ActivationScreen() {
  const { session } = useAuth();
  const activation = useActivation();
  const onboarding = useOnboardingState();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => code.trim().length > 0 && !loading, [code, loading]);

  const onActivate = async () => {
    const userId = session?.user?.id;
    if (!userId) {
      Alert.alert('Not signed in', 'Please sign in again.');
      return;
    }

    setLoading(true);
    try {
      const result = await redeemActivationCode(code);
      if (!result.ok) {
        Alert.alert('Activation failed', result.message);
        return;
      }
      await activation.refresh();
      await onboarding.markComplete();
    } catch {
      Alert.alert('Activation failed', 'Unexpected error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-black px-6">
      <View className="flex-1 justify-center">
        <Text className="text-white text-3xl font-bold text-center">Activate your RISE</Text>
        <Text className="text-zinc-400 text-center mt-2">
          Enter the activation code from your device packaging.
        </Text>

        <View className="mt-10">
          <Text className="text-zinc-400 text-sm mb-2">Activation code</Text>
          <TextInput
            className="h-12 rounded-xl bg-zinc-900/60 border border-white/10 px-4 text-white"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            placeholder="XXXX-XXXX"
            placeholderTextColor="#71717a"
          />

          <Pressable
            className={[
              'mt-6 h-12 rounded-xl items-center justify-center',
              canSubmit ? 'bg-white' : 'bg-zinc-700',
            ].join(' ')}
            onPress={onActivate}
            disabled={!canSubmit}
          >
            <Text className={canSubmit ? 'text-black font-semibold' : 'text-zinc-200 font-semibold'}>
              {loading ? 'Activating…' : 'Activate'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

