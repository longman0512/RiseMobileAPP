import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Apple } from 'lucide-react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoogleIcon } from '../../components/icons/GoogleIcon';
import { PasswordInput } from '../../components/PasswordInput';
import { signInWithOAuthProvider } from '../../lib/oauth';
import { supabase } from '../../lib/supabase';
import type { AuthStackParamList } from '../../navigation/auth/AuthNavigator';

export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(
    () => email.trim().length > 0 && password.length > 0 && !loading,
    [email, password, loading],
  );

  const headerTopGap = useMemo(() => {
    const minGap = insets.top + 32;
    const proportionalGap = windowHeight * 0.12;
    const maxGap = insets.top + 96;
    return Math.round(Math.min(Math.max(proportionalGap, minGap), maxGap));
  }, [insets.top, windowHeight]);

  const onEmailLogin = async () => {
    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) {
        Alert.alert('Login failed', error.message);
      }
    } catch {
      Alert.alert('Login failed', 'Unexpected error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onOAuthLogin = async (provider: 'google' | 'apple') => {
    setLoading(true);
    try {
      await signInWithOAuthProvider(provider);
    } catch {
      Alert.alert('Login failed', 'Unexpected error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-black">
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 24,
        }}
        enableOnAndroid
        enableAutomaticScroll
        extraScrollHeight={40}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center" style={{ paddingTop: headerTopGap }}>
          <Text className="text-white text-4xl font-extrabold">RISE</Text>
          <Text className="text-zinc-400 mt-2">Enter the focus ecosystem</Text>
        </View>

        <View className="mt-10 gap-4">
          <Pressable
            className="w-full h-12 bg-white rounded-xl flex-row items-center justify-center gap-3"
            onPress={() => onOAuthLogin('apple')}
            disabled={loading}
          >
            <Apple size={20} color="#000000" strokeWidth={2.25} />
            <Text className="text-black font-semibold">Continue with Apple</Text>
          </Pressable>
          <Pressable
            className="w-full h-12 bg-white rounded-xl flex-row items-center justify-center gap-3"
            onPress={() => onOAuthLogin('google')}
            disabled={loading}
          >
            <GoogleIcon size={20} />
            <Text className="text-black font-semibold">Continue with Google</Text>
          </Pressable>
        </View>

        <View className="mt-8 flex-row items-center">
          <View className="flex-1 h-px bg-white/10" />
          <Text className="text-zinc-400 px-4 text-xs">or continue with email</Text>
          <View className="flex-1 h-px bg-white/10" />
        </View>

        <View className="mt-6 gap-4">
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
              returnKeyType="next"
            />
          </View>

          <View>
            <Text className="text-zinc-400 text-sm mb-2">Password</Text>
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              returnKeyType="done"
              onSubmitEditing={canSubmit ? onEmailLogin : undefined}
            />
          </View>

          <Pressable
            className={[
              'w-full h-12 rounded-xl items-center justify-center',
              canSubmit ? 'bg-white' : 'bg-zinc-700',
            ].join(' ')}
            onPress={onEmailLogin}
            disabled={!canSubmit}
          >
            <Text className={canSubmit ? 'text-black font-semibold' : 'text-zinc-200 font-semibold'}>
              {loading ? 'Checking…' : 'Continue'}
            </Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate('Signup')} className="items-center">
            <Text className="text-zinc-400">
              Don&apos;t have an account? <Text className="text-white font-semibold">Sign up</Text>
            </Text>
          </Pressable>
        </View>

        <Text className="text-center text-xs text-zinc-500 mt-8 pb-2">
          By continuing, you agree to RISE&apos;s Terms of Service and Privacy Policy
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
}
