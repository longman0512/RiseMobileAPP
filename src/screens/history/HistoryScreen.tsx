import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Clock, LogOut } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityHeatmap } from '../../components/ActivityHeatmap';
import { DashboardCard } from '../../components/DashboardCard';
import { BarChartIcon } from '../../components/icons/BarChartIcon';
import { SessionDayModal } from '../../components/SessionDayModal';
import { weeklyFocusHours } from '../../lib/sessionAnalytics';
import { fetchSessionHistory, fetchUserStats, type SessionRecord, type UserStats } from '../../lib/sessionApi';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';

export function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalSessions, setModalSessions] = useState<SessionRecord[]>([]);

  const weeklyHours = useMemo(() => weeklyFocusHours(sessions), [sessions]);
  const totalSessions = sessions.length;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);

    const [historyResult, statsResult] = await Promise.all([
      fetchSessionHistory(userId),
      fetchUserStats(userId),
    ]);

    setSessions(historyResult.sessions);
    setStats(statsResult.stats);

    const errors = [historyResult.error, statsResult.error].filter(Boolean);
    if (errors.length > 0) {
      setLoadError(errors.join(' · '));
    }

    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setLoading(false));
    }, [load]),
  );

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Logout failed', error.message);
    }
  };

  const openDayModal = useCallback((date: string, daySessions: SessionRecord[]) => {
    setModalDate(date);
    setModalSessions(daySessions);
  }, []);

  const closeDayModal = useCallback(() => {
    setModalDate(null);
    setModalSessions([]);
  }, []);

  return (
    <View className="flex-1 bg-[#0A0A0C]" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-6 mt-6 mb-2">
        <Text className="text-white text-3xl font-bold">History</Text>
        <Pressable
          onPress={logout}
          className="flex-row items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5"
        >
          <LogOut size={14} color="#fafafa" />
          <Text className="text-white text-xs font-semibold">Logout</Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#fff" />}
      >
        <Text className="text-zinc-500 text-sm">Tap a coin to begin a session</Text>

        <View className="mt-8 rounded-2xl border border-white/10 bg-zinc-900/50 p-6 items-center">
          <Text className="text-zinc-500 text-xs uppercase tracking-widest">Current streak</Text>
          <Text className="text-white text-5xl font-bold mt-2">{stats?.current_streak ?? 0}</Text>
          <Text className="text-zinc-600 text-sm mt-1">
            Longest: {stats?.longest_streak ?? 0} days
          </Text>
        </View>

        {loadError ? (
          <Text className="text-amber-500/90 text-center mt-4 text-sm px-2">{loadError}</Text>
        ) : null}

        {loading && sessions.length === 0 ? (
          <ActivityIndicator className="mt-12" color="#fff" />
        ) : null}

        {!loading && sessions.length === 0 && !loadError ? (
          <Text className="text-zinc-500 text-center mt-6 text-sm">
            No sessions yet. Tap a coin to start.
          </Text>
        ) : null}

        <View className="flex-row gap-4 mt-8">
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

        <DashboardCard className="mt-6 min-h-[200px]">
          <View className="items-center mb-4">
            <Text className="text-white text-sm font-medium">Activity Calendar</Text>
            <Text className="text-zinc-400 text-xs mt-0.5">Last 90 days</Text>
          </View>
          <ActivityHeatmap sessions={sessions} onDayPress={openDayModal} />
        </DashboardCard>
      </ScrollView>

      <SessionDayModal
        visible={modalDate != null}
        date={modalDate}
        sessions={modalSessions}
        onClose={closeDayModal}
      />
    </View>
  );
}
