import React from 'react';
import { ScrollView, Text, View } from 'react-native';

export function EnvSetupScreen() {
  return (
    <ScrollView className="flex-1 bg-[#0A0A0C]" contentContainerClassName="px-6 py-14">
      <Text className="text-white text-2xl font-bold">Configuration required</Text>
      <Text className="text-zinc-400 mt-4 leading-6">
        Supabase credentials are missing. The app cannot start auth until they are set.
      </Text>

      <View className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
        <Text className="text-white font-semibold">1. Create env file</Text>
        <Text className="text-zinc-400 mt-2 font-mono text-sm leading-5">
          copy .env.example → .env
        </Text>
      </View>

      <View className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <Text className="text-white font-semibold">2. Fill in Supabase</Text>
        <Text className="text-zinc-400 mt-2 leading-6">
          In the Supabase dashboard: Project Settings → API. Set SUPABASE_URL and SUPABASE_ANON_KEY in
          .env at the project root.
        </Text>
      </View>

      <View className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <Text className="text-white font-semibold">3. Enable Google sign-in redirect</Text>
        <Text className="text-zinc-400 mt-2 leading-6">
          In Supabase: Authentication → URL Configuration → Redirect URLs, add:
        </Text>
        <Text className="text-zinc-300 mt-2 font-mono text-sm">risemobile://auth/callback</Text>
        <Text className="text-zinc-500 mt-2 text-sm">
          Set OAUTH_REDIRECT_URL in .env to the same value (default in .env.example).
        </Text>
      </View>

      <View className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <Text className="text-white font-semibold">4. Rebuild native app</Text>
        <Text className="text-zinc-400 mt-2 font-mono text-sm leading-5">
          npx react-native start --reset-cache{'\n'}
          npm run android
        </Text>
        <Text className="text-zinc-500 mt-2 text-sm">
          react-native-config reads .env at build time; reload alone is not enough.
        </Text>
      </View>
    </ScrollView>
  );
}
