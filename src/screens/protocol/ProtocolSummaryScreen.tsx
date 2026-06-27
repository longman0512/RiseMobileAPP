import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProtocolCoinBadge } from '../../components/protocol/ProtocolCoinBadge';
import type { ProtocolStackParamList } from '../../navigation/protocol/ProtocolNavigator';
import { fetchUserStats } from '../../lib/sessionApi';
import { formatTimer, PROTOCOL_THEME } from '../../lib/protocolTheme';
import {
  formatPoints,
  rankFromPoints,
  totalPointsFromMinutes,
} from '../../lib/sessionScoring';
import { useAuth } from '../../providers/AuthProvider';
import { useSession } from '../../providers/SessionProvider';
import type { CoinType } from '../../types/coins';

type Props = NativeStackScreenProps<ProtocolStackParamList, 'Summary'>;

function focusedMinutes(protocol: CoinType, focusMinutes: number, actualMinutes: number): number {
  return protocol === 'lockin' ? actualMinutes : focusMinutes;
}

export function ProtocolSummaryScreen({ route }: Props) {
  const { protocol } = route.params;
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const sessionState = useSession();
  const summary = sessionState.summary;
  const saving = sessionState.isSavingSession;
  const theme = PROTOCOL_THEME[protocol];

  const [totalPoints, setTotalPoints] = useState<number | null>(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || !summary) return;
    let cancelled = false;
    void fetchUserStats(userId).then(({ stats }) => {
      if (cancelled) return;
      const base = totalPointsFromMinutes(stats.total_lockin_mins, stats.total_flow_mins);
      setTotalPoints(base + summary.pointsEarned);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, summary]);

  const rank = useMemo(
    () => rankFromPoints(totalPoints ?? summary?.pointsEarned ?? 0),
    [summary?.pointsEarned, totalPoints],
  );

  if (protocol !== 'lockin') {
    return (
      <View style={styles.emptyRoot}>
        <Text style={styles.emptyText}>This screen is only used after LOCK IN sessions.</Text>
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={styles.emptyRoot}>
        <Text style={styles.emptyText}>No session data</Text>
      </View>
    );
  }

  const focusedSecs = focusedMinutes(protocol, summary.focusMinutes, summary.actualMinutes) * 60;
  const focusedLabel = formatTimer(focusedSecs);
  const subtitle =
    summary.exits === 0
      ? `${summary.actualMinutes} minutes of uninterrupted focus.`
      : `${summary.actualMinutes} minutes focused · ${summary.exits} exit${summary.exits === 1 ? '' : 's'}.`;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.hero}>
        <ProtocolCoinBadge colors={theme.coinGradient} size={72} />
        <Text style={styles.title}>
          Session{'\n'}
          <Text style={styles.titleLight}>complete.</Text>
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{focusedLabel}</Text>
          <Text style={styles.statLabel}>Focused</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statNum, styles.statGold]}>+{summary.pointsEarned}</Text>
          <Text style={styles.statLabel}>Points</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNum}>{summary.exits}</Text>
          <Text style={styles.statLabel}>Exits</Text>
        </View>
      </View>

      <View style={styles.rankBar}>
        <View style={styles.rankTop}>
          <Text style={styles.rankName}>{rank.name}</Text>
          <Text style={styles.rankNext}>
            {rank.pointsToNext != null
              ? `${formatPoints(rank.pointsToNext)} pts to ${rank.nextName}`
              : 'Max rank'}
          </Text>
        </View>
        <View style={styles.rankTrack}>
          <View style={[styles.rankFill, { width: `${Math.round(rank.progress * 100)}%` }]} />
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[styles.doneButton, saving && styles.doneButtonDisabled]}
          onPress={() => void sessionState.finishSummary()}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#0A0A0C" /> : null}
          <Text style={styles.doneText}>{saving ? 'Saving…' : 'Done'}</Text>
        </Pressable>

        <Pressable style={styles.ghostButton} onPress={() => sessionState.cancelSession()}>
          <Text style={styles.ghostText}>Start another session</Text>
        </Pressable>

        {!saving ? (
          <Text style={styles.savedHint}>Session saved to your history.</Text>
        ) : (
          <Text style={styles.savedHint}>Saving to your history…</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A0A0C',
    flex: 1,
    paddingHorizontal: 28,
  },
  emptyRoot: {
    alignItems: 'center',
    backgroundColor: '#0A0A0C',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  emptyText: {
    color: '#9A9AA2',
    textAlign: 'center',
  },
  hero: {
    alignItems: 'center',
    paddingTop: 40,
  },
  title: {
    color: '#F5F5F7',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.9,
    lineHeight: 34,
    marginTop: 26,
    textAlign: 'center',
  },
  titleLight: {
    color: '#9A9AA2',
    fontWeight: '200',
  },
  subtitle: {
    color: '#9A9AA2',
    fontSize: 13.5,
    fontWeight: '300',
    lineHeight: 20,
    marginTop: 10,
    textAlign: 'center',
  },
  stats: {
    borderBottomColor: '#222228',
    borderBottomWidth: 1,
    borderTopColor: '#222228',
    borderTopWidth: 1,
    flexDirection: 'row',
    marginTop: 36,
  },
  stat: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 20,
  },
  statDivider: {
    backgroundColor: '#222228',
    width: 1,
  },
  statNum: {
    color: '#F5F5F7',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  statGold: {
    color: '#E8C56A',
  },
  statLabel: {
    color: '#5C5C66',
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 5,
    textTransform: 'uppercase',
  },
  rankBar: {
    marginTop: 30,
  },
  rankTop: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  rankName: {
    color: '#E8C56A',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  rankNext: {
    color: '#5C5C66',
    fontSize: 11,
    fontWeight: '400',
  },
  rankTrack: {
    backgroundColor: '#131316',
    borderRadius: 3,
    height: 5,
    overflow: 'hidden',
  },
  rankFill: {
    backgroundColor: '#E8C56A',
    borderRadius: 3,
    height: '100%',
  },
  footer: {
    gap: 4,
    marginTop: 'auto',
  },
  doneButton: {
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    height: 48,
    justifyContent: 'center',
  },
  doneButtonDisabled: {
    opacity: 0.7,
  },
  doneText: {
    color: '#0A0A0C',
    fontSize: 14,
    fontWeight: '600',
  },
  ghostButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
  },
  ghostText: {
    color: '#9A9AA2',
    fontSize: 13,
    fontWeight: '500',
  },
  savedHint: {
    color: '#5C5C66',
    fontSize: 11,
    fontWeight: '300',
    marginTop: 4,
    textAlign: 'center',
  },
});
