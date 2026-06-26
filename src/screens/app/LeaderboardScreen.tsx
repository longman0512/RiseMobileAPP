import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';

import { supabase } from '../../lib/supabase';

type LeaderboardUser = {
  id: string;
  username: string | null;
  total_focus_minutes: number;
};

export function LeaderboardScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('user_stats')
      .select('user_id, total_lockin_mins, total_flow_mins, total_reset_mins, profiles(username)')
      .order('total_flow_mins', { ascending: false })
      .limit(50);

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    const rows = (data ?? []).map((row) => {
      const profile = row.profiles as { username?: string | null } | { username?: string | null }[] | null;
      const username = Array.isArray(profile) ? profile[0]?.username : profile?.username;
      const total =
        (row.total_lockin_mins ?? 0) + (row.total_flow_mins ?? 0) + (row.total_reset_mins ?? 0);
      return {
        id: row.user_id as string,
        username: username ?? null,
        total_focus_minutes: total,
      };
    });

    setUsers(rows.sort((a, b) => b.total_focus_minutes - a.total_focus_minutes));
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View className="flex-1 bg-[#0A0A0C] px-6 pt-14">
      <Text className="text-white text-3xl font-bold">Leaderboard</Text>
      <Text className="text-zinc-500 mt-1 text-sm">Total focus minutes (Supabase)</Text>

      {loading ? (
        <ActivityIndicator className="mt-10" color="#fff" />
      ) : error ? (
        <Text className="text-red-400 mt-8">{error}</Text>
      ) : (
        <FlatList
          className="mt-6"
          data={users}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          renderItem={({ item, index }) => (
            <View className="flex-row items-center py-4 border-b border-white/5">
              <Text className="text-zinc-500 w-8">{index + 1}</Text>
              <Text className="text-white flex-1">{item.username ?? 'Anonymous'}</Text>
              <Text className="text-zinc-400">{item.total_focus_minutes}m</Text>
            </View>
          )}
          ListEmptyComponent={<Text className="text-zinc-500 mt-8">No sessions yet</Text>}
        />
      )}
    </View>
  );
}
