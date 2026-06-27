import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProtocolCoinBadge } from '../../components/protocol/ProtocolCoinBadge';
import {
  formatHoursMinutesLong,
  formatRankPoints,
  founderBadgeLabel,
  journeyRank,
  resetSessionCount,
  sessionCompletionRate,
  totalFocusMinutes,
} from '../../lib/journeyFormat';
import { PROTOCOL_THEME } from '../../lib/protocolTheme';
import { fetchSessionHistory, fetchUserStats, type SessionRecord, type UserStats } from '../../lib/sessionApi';
import { useAuth } from '../../providers/AuthProvider';
import { COIN_LABELS, COIN_TYPES, type CoinType } from '../../types/coins';

const EMPTY_STATS: UserStats = {
  current_streak: 0,
  longest_streak: 0,
  last_session_date: null,
  total_lockin_mins: 0,
  total_flow_mins: 0,
  total_reset_mins: 0,
};

function avatarInitial(username: string | undefined, email: string | undefined): string {
  const source = username?.trim() || email?.trim() || '?';
  return source.charAt(0).toUpperCase();
}

function coinMinutes(stats: UserStats, type: CoinType): number {
  if (type === 'lockin') return stats.total_lockin_mins;
  if (type === 'flow') return stats.total_flow_mins;
  return stats.total_reset_mins;
}

export function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const username = session?.user?.user_metadata?.username as string | undefined;
  const email = session?.user?.email ?? '';
  const founderNumber = session?.user?.user_metadata?.founder_number as number | undefined;

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [historyResult, statsResult] = await Promise.all([
      fetchSessionHistory(userId),
      fetchUserStats(userId),
    ]);
    setSessions(historyResult.sessions);
    setStats(statsResult.stats);
    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { points, rank } = useMemo(() => journeyRank(stats), [stats]);
  const founderLabel = founderBadgeLabel(founderNumber);
  const totalFocus = totalFocusMinutes(stats);
  const completion = sessionCompletionRate(sessions);
  const resetsTaken = resetSessionCount(sessions);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingHorizontal: 28 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#fff" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarInitial(username, email)}</Text>
          </View>
          <View style={styles.identity}>
            <Text style={styles.name}>{username?.trim() || 'Rise member'}</Text>
            {founderLabel ? (
              <View style={styles.founderChip}>
                <View style={styles.founderDot} />
                <Text style={styles.founderText}>{founderLabel.toUpperCase()}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.rankCard}>
          <View style={styles.rankRing} />
          <Text style={styles.rankLabel}>Current rank</Text>
          <Text style={styles.rankBig}>{rank.name}</Text>
          <Text style={styles.rankPts}>{formatRankPoints(points)}</Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.cell}>
            <Text style={styles.cellNum}>{formatHoursMinutesLong(totalFocus)}</Text>
            <Text style={styles.cellLabel}>Total focus</Text>
          </View>
          <View style={styles.cell}>
            <Text style={styles.cellNum}>{sessions.length}</Text>
            <Text style={styles.cellLabel}>Sessions</Text>
          </View>
          <View style={styles.cell}>
            <Text style={styles.cellNum}>{completion}%</Text>
            <Text style={styles.cellLabel}>Completion</Text>
          </View>
          <View style={styles.cell}>
            <Text style={styles.cellNum}>{resetsTaken}</Text>
            <Text style={styles.cellLabel}>Resets taken</Text>
          </View>
        </View>

        <Text style={styles.sectionHd}>By coin</Text>
        <View style={styles.coinList}>
          {COIN_TYPES.map((type) => {
            const theme = PROTOCOL_THEME[type];
            const mins = coinMinutes(stats, type);
            return (
              <View key={type} style={styles.coinRow}>
                <ProtocolCoinBadge colors={theme.coinGradient} size={34} />
                <Text style={styles.coinName}>{COIN_LABELS[type]}</Text>
                <Text style={styles.coinHours}>{formatHoursMinutesLong(mins)}</Text>
              </View>
            );
          })}
        </View>

        {loading && sessions.length === 0 ? (
          <ActivityIndicator color="#fff" style={styles.loader} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A0A0C',
    flex: 1,
  },
  head: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    paddingTop: 34,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#131316',
    borderColor: '#2E2E36',
    borderRadius: 29,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  avatarText: {
    color: '#F5F5F7',
    fontSize: 19,
    fontWeight: '600',
  },
  identity: {
    flex: 1,
  },
  name: {
    color: '#F5F5F7',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  founderChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(201,162,75,0.08)',
    borderColor: 'rgba(201,162,75,0.4)',
    borderRadius: 100,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  founderDot: {
    backgroundColor: '#E8C56A',
    borderRadius: 3,
    height: 5,
    width: 5,
  },
  founderText: {
    color: '#E8C56A',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  rankCard: {
    alignItems: 'center',
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 30,
    overflow: 'hidden',
    padding: 24,
  },
  rankRing: {
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 110,
    borderWidth: 1,
    height: 220,
    position: 'absolute',
    top: -70,
    width: 220,
  },
  rankLabel: {
    color: '#5C5C66',
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 1.47,
    textTransform: 'uppercase',
  },
  rankBig: {
    color: '#F5F5F7',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
    marginTop: 8,
  },
  rankPts: {
    color: '#9A9AA2',
    fontSize: 12,
    fontWeight: '300',
    marginTop: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  cell: {
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    padding: 16,
  },
  cellNum: {
    color: '#F5F5F7',
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  cellLabel: {
    color: '#5C5C66',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.8,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  sectionHd: {
    color: '#5C5C66',
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 1.47,
    marginBottom: 12,
    marginTop: 22,
    textTransform: 'uppercase',
  },
  coinList: {
    gap: 0,
  },
  coinRow: {
    alignItems: 'center',
    borderBottomColor: '#222228',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 12,
  },
  coinName: {
    color: '#F5F5F7',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  coinHours: {
    color: '#9A9AA2',
    fontSize: 12.5,
    fontWeight: '300',
  },
  loader: {
    marginTop: 24,
  },
});
