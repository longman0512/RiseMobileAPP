import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';

export function CreateUsernameScreen() {
  const { session, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => username.trim().length >= 3 && !loading, [username, loading]);

  const onSubmit = async () => {
    const userId = session?.user?.id;
    if (!userId) {
      Alert.alert('Not signed in', 'Please sign in again.');
      return;
    }

    const clean = username.trim();
    if (clean.length < 3) {
      Alert.alert('Username too short', 'Please use at least 3 characters.');
      return;
    }

    setLoading(true);
    try {
      // Goes through an RPC: profiles is column-locked so friend_code cannot
      // be read or edited by clients, which makes a direct upsert impossible.
      const { error: rpcError } = await supabase.rpc('set_my_username', {
        p_username: clean,
      });
      if (rpcError) {
        Alert.alert('Failed', rpcError.message);
        return;
      }

      // Keep parity with the web app which reads `user_metadata.username` in places.
      const { error: metaError } = await supabase.auth.updateUser({ data: { username: clean } });
      if (metaError) {
        Alert.alert('Saved, but…', metaError.message);
        return;
      }

      await refreshProfile();
    } catch {
      Alert.alert('Failed', 'Unexpected error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#0A0A0C] px-6">
      <View className="flex-1 justify-center">
        <Text className="text-white text-3xl font-bold text-center">Choose a username</Text>
        <Text className="text-zinc-400 text-center mt-2">
          This will be shown on the leaderboard.
        </Text>

        <View className="mt-10">
          <Text className="text-zinc-400 text-sm mb-2">Username</Text>
          <TextInput
            className="h-12 rounded-xl bg-zinc-900/60 border border-white/10 px-4 text-white"
            value={username}
            onChangeText={setUsername}
            placeholder="winterstory"
            placeholderTextColor="#71717a"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Pressable
            className={[
              'mt-6 h-12 rounded-xl items-center justify-center',
              canSubmit ? 'bg-white' : 'bg-zinc-700',
            ].join(' ')}
            onPress={onSubmit}
            disabled={!canSubmit}
          >
            <Text className={canSubmit ? 'text-black font-semibold' : 'text-zinc-200 font-semibold'}>
              {loading ? 'Saving…' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

