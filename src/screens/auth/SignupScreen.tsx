import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { PasswordInput } from '../../components/PasswordInput';
import { supabase } from '../../lib/supabase';
import type { AuthStackParamList } from '../../navigation/auth/AuthNavigator';

export function SignupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(
    () => email.trim().length > 0 && password.length >= 8 && !loading,
    [email, password, loading],
  );

  const onSignup = async () => {
    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });
      if (error) {
        Alert.alert('Sign up failed', error.message);
        return;
      }
      navigation.replace('VerifyEmail');
    } catch {
      Alert.alert('Sign up failed', 'Unexpected error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-black px-6">
      <View className="flex-1 justify-center">
        <Text className="text-white text-3xl font-bold text-center">Create account</Text>
        <Text className="text-zinc-400 text-center mt-2">Sign up with email</Text>

        <View className="mt-10 space-y-4">
          <View>
            <Text className="text-zinc-400 text-sm mb-2">Email</Text>
            <TextInput
              className="h-12 rounded-xl bg-zinc-900/60 border border-white/10 px-4 text-white"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="operator@rise.com"
              placeholderTextColor="#71717a"
            />
          </View>

          <View>
            <Text className="text-zinc-400 text-sm mb-2">Password</Text>
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              placeholder="Minimum 8 characters"
            />
          </View>

          <Pressable
            className={[
              'mt-2 h-12 rounded-xl items-center justify-center',
              canSubmit ? 'bg-white' : 'bg-zinc-700',
            ].join(' ')}
            onPress={onSignup}
            disabled={!canSubmit}
          >
            <Text className={canSubmit ? 'text-black font-semibold' : 'text-zinc-200 font-semibold'}>
              {loading ? 'Creating…' : 'Create account'}
            </Text>
          </Pressable>

          <Pressable onPress={() => navigation.goBack()} className="mt-4 items-center">
            <Text className="text-zinc-400">
              Already have an account? <Text className="text-white font-semibold">Log in</Text>
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

