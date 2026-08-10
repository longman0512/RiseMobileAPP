import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDuration } from '../../lib/squadFormat';
import { formatXp } from '../../lib/xp';
import { useSession } from '../../providers/SessionProvider';

function Line({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

/**
 * The Grand Finale — the only reward screen in the app. Nothing is revealed
 * per block; it all lands here, once, when the user formally ends the shift.
 */
export function ProtocolFinaleScreen() {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const finale = session.finale;

  if (!finale) {
    return (
      <View style={styles.emptyRoot}>
        <Text style={styles.emptyText}>No shift data</Text>
        <Pressable style={styles.doneButton} onPress={session.dismissFinale}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  const { xp } = finale;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 26 }]}>
      <View style={styles.hero}>
        <LinearGradient colors={['#F0D88A', '#C9A24B', '#8F6F2B']} style={styles.medal}>
          <View style={styles.medalInner} />
        </LinearGradient>
        <Text style={styles.title}>
          Shift{'\n'}
          <Text style={styles.titleLight}>complete.</Text>
        </Text>
        <Text style={styles.subtitle}>
          {finale.blockCount} block{finale.blockCount === 1 ? '' : 's'} ·{' '}
          {formatDuration(finale.focusMinutes)} focused
        </Text>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>TOTAL XP EARNED</Text>
        <Text style={styles.totalValue}>+{formatXp(xp.total)}</Text>
        {finale.lifetimeXp != null ? (
          <Text style={styles.lifetime}>{formatXp(finale.lifetimeXp)} XP all time</Text>
        ) : null}
      </View>

      <View style={styles.breakdown}>
        <Line label="Lock In" value={`${formatXp(xp.lockin)} XP`} />
        <Line label="Flow" value={`${formatXp(xp.flow)} XP`} />
        <Line
          label={`Overtime bonus · ${formatDuration(finale.overtimeMinutes)}`}
          value={`+${formatXp(xp.overtimeBonus)} XP`}
          accent="#E8C56A"
        />
        <Line label="Shift length" value={formatDuration(finale.shiftMinutes)} />
      </View>

      <Text style={styles.note}>
        Overtime bonus is the extra those minutes earned above the standard rate — it is already
        counted in the total.
      </Text>

      <Pressable style={styles.doneButton} onPress={session.dismissFinale}>
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
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
    marginBottom: 20,
  },
  hero: {
    alignItems: 'center',
  },
  medal: {
    alignItems: 'center',
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  medalInner: {
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 26,
    borderWidth: 1,
    height: 52,
    width: 52,
  },
  title: {
    color: '#F5F5F7',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.9,
    lineHeight: 34,
    marginTop: 20,
    textAlign: 'center',
  },
  titleLight: {
    color: '#9A9AA2',
    fontWeight: '200',
  },
  subtitle: {
    color: '#9A9AA2',
    fontSize: 13,
    fontWeight: '300',
    marginTop: 10,
  },
  totalCard: {
    alignItems: 'center',
    borderColor: 'rgba(232,197,106,0.35)',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 28,
    paddingVertical: 22,
  },
  totalLabel: {
    color: '#5C5C66',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  totalValue: {
    color: '#E8C56A',
    fontSize: 46,
    fontWeight: '700',
    letterSpacing: -1.5,
    marginTop: 6,
  },
  lifetime: {
    color: '#5C5C66',
    fontSize: 11.5,
    fontWeight: '300',
    marginTop: 4,
  },
  breakdown: {
    marginTop: 22,
  },
  line: {
    borderBottomColor: '#222228',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  lineLabel: {
    color: '#9A9AA2',
    fontSize: 13,
    fontWeight: '300',
  },
  lineValue: {
    color: '#F5F5F7',
    fontSize: 13.5,
    fontWeight: '600',
  },
  note: {
    color: '#5C5C66',
    fontSize: 10.5,
    fontWeight: '300',
    lineHeight: 16,
    marginTop: 14,
  },
  doneButton: {
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
    marginTop: 'auto',
  },
  doneText: {
    color: '#0A0A0C',
    fontSize: 14.5,
    fontWeight: '600',
  },
});
