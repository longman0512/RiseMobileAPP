import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Clock, LogOut, Star } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityHeatmap } from '../../components/ActivityHeatmap';
import { DashboardCard } from '../../components/DashboardCard';
import { OnlinePulseDot } from '../../components/OnlinePulseDot';
import { BarChartIcon } from '../../components/icons/BarChartIcon';
import { useAuth } from '../../providers/AuthProvider';
import { supabase } from '../../lib/supabase';

const ADMIN_EMAILS = ['tomascaetano2004@gmail.com', 'winterstory0523@gmail.com'];

const styles = StyleSheet.create({
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.46,
    shadowRadius: 16,
    elevation: 8,
  },
});

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');

  const onlineUsers = 153;
  const weeklyHours = 12.5;
  const totalSessions = 42;
  const focusPoints = 1250;

  const isAdmin = useMemo(() => email.length > 0 && ADMIN_EMAILS.includes(email), [email]);

  useEffect(() => {
    const user = session?.user;
    if (!user) return;
    setEmail(user.email ?? '');
    setUsername((user.user_metadata?.username as string | undefined) ?? '');
  }, [session?.user]);

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Logout failed', error.message);
    }
  };

  return (
    <View className="flex-1 bg-[#0A0A0C]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 96,
          paddingHorizontal: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row justify-end mb-2">
          <View className="flex-row items-center gap-2">
            {isAdmin ? (
              <Pressable
                onPress={() => Alert.alert('Admin', 'Admin panel is available on the web app.')}
                className="flex-row items-center gap-1.5 rounded-full bg-cyan-500 px-3 py-1.5"
              >
                <Text className="text-white text-xs font-semibold">Admin</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={logout}
              className="flex-row items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5"
            >
              <LogOut size={14} color="#fafafa" />
              <Text className="text-white text-xs font-semibold">Logout</Text>
            </Pressable>
          </View>
        </View>

        <View className="pt-2 pb-4">
          <Text className="text-zinc-400 text-sm mb-1">Welcome back</Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-white text-2xl font-medium flex-1 mr-3" numberOfLines={1}>
              {username || 'Operator'}
            </Text>
            <View className="flex-row items-center gap-2 rounded-lg border border-white/10 bg-cyan-500/20 px-2 py-1">
              <OnlinePulseDot />
              <Text className="text-cyan-400 text-sm font-semibold">{onlineUsers} online</Text>
            </View>
          </View>
        </View>

        <View className="flex-row gap-4 mb-6">
          <DashboardCard className="flex-1 h-32">
            <View className="flex-row items-start gap-2 mb-2">
              <Clock size={18} color="#22d3ee" />
              <Text className="text-zinc-400 text-xs">This Week</Text>
            </View>
            <Text className="text-cyan-400 text-3xl font-bold">
              {weeklyHours}
              <Text className="text-zinc-400 text-xs font-normal"> hrs</Text>
            </Text>
          </DashboardCard>

          <DashboardCard className="flex-1 h-32">
            <View className="flex-row items-start gap-2 mb-2">
              <BarChartIcon size={20} color="rgba(34,211,238,0.5)" />
              <Text className="text-zinc-400 text-xs">Sessions</Text>
            </View>
            <Text className="text-white text-3xl font-bold">
              {totalSessions}
              <Text className="text-zinc-400 text-xs font-normal"> total</Text>
            </Text>
          </DashboardCard>
        </View>

        <DashboardCard className="mb-6 min-h-[200px]">
          <View className="items-center mb-4">
            <Text className="text-white text-sm font-medium">Activity Calendar</Text>
            <Text className="text-zinc-400 text-xs mt-0.5">Last 90 days</Text>
          </View>
          <ActivityHeatmap sessions={[]} />
        </DashboardCard>

        <DashboardCard className="mb-6 h-40">
          <View className="flex-row items-center gap-2 mb-1">
            <Star size={18} color="#22d3ee" fill="#22d3ee" />
            <Text className="text-white text-xs">Focus Points</Text>
          </View>
          <Text className="text-cyan-400 text-3xl font-bold">
            {focusPoints}
            <Text className="text-zinc-400 text-xs font-normal"> pts</Text>
          </Text>
          <Text className="text-zinc-400 text-xs mt-1">
            Keep your streak going to earn more points
          </Text>
        </DashboardCard>

        <View className="flex-row gap-3 justify-center mb-6">
          <View
            className="flex-row items-center gap-2 rounded-full border border-white/10 bg-zinc-950 px-4 py-2"
            style={styles.cardShadow}
          >
            <View className="h-2 w-2 rounded-full bg-cyan-400" />
            <Text className="text-white text-xs">System Ready</Text>
          </View>
          <View
            className="flex-row items-center gap-2 rounded-full border border-white/10 bg-zinc-950 px-4 py-2"
            style={styles.cardShadow}
          >
            <View className="h-2 w-2 rounded-full bg-zinc-500" />
            <Text className="text-zinc-400 text-xs">Standby</Text>
          </View>
        </View>

        <View className="h-14 rounded-2xl border border-white/10 items-center justify-center">
          <Text className="text-zinc-400 text-sm">Tap a coin on your phone to begin</Text>
        </View>
      </ScrollView>
    </View>
  );
}
