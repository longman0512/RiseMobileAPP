import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoldToConfirm } from '../../components/HoldToConfirm';
import { ProtocolAppFeed } from '../../components/protocol/ProtocolAppFeed';
import { ProtocolCoinBadge } from '../../components/protocol/ProtocolCoinBadge';
import { ProtocolTimerRing } from '../../components/protocol/ProtocolTimerRing';
import { hasFocusModeSelection } from '../../lib/focusMode';
import type { ProtocolStackParamList } from '../../navigation/protocol/ProtocolNavigator';
import { formatTimer, PROTOCOL_THEME } from '../../lib/protocolTheme';
import { useSession } from '../../providers/SessionProvider';
import { COIN_LABELS } from '../../types/coins';

type Props = NativeStackScreenProps<ProtocolStackParamList, 'Active'>;

export function ProtocolActiveScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const protocol = session.activeProtocol ?? route.params.protocol;
  const theme = PROTOCOL_THEME[protocol];

  const [hasFocusSelection, setHasFocusSelection] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void hasFocusModeSelection(protocol).then((value) => {
      if (!cancelled) setHasFocusSelection(value);
    });
    return () => {
      cancelled = true;
    };
  }, [protocol]);

  /**
   * The timer never alarms. Inside the planned length it counts down; the
   * moment it would hit zero it inverts and counts up as "+N", and the ring
   * fills past full. Nothing interrupts the user.
   */
  const timer = useMemo(() => {
    if (session.isOvertime) {
      return {
        main: `+${formatTimer(session.blockOvertimeSeconds)}`,
        sub: 'overtime · earning more',
        progress: 1,
      };
    }
    const total = session.plannedMinutes * 60;
    return {
      main: formatTimer(session.blockRemainingSeconds),
      sub: `of ${formatTimer(total)}`,
      progress: total > 0 ? session.blockElapsedSeconds / total : 0,
    };
  }, [
    session.blockElapsedSeconds,
    session.blockOvertimeSeconds,
    session.blockRemainingSeconds,
    session.isOvertime,
    session.plannedMinutes,
  ]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.head}>
          <View style={styles.protoTag}>
            <View style={[styles.tagDot, { backgroundColor: theme.accent }]} />
            <Text style={[styles.tagLabel, { color: theme.accent }]}>{COIN_LABELS[protocol]}</Text>
          </View>
          <Text style={styles.eyebrow}>
            BLOCK · {String(session.blockIndex).padStart(2, '0')}
          </Text>
        </View>

        <View style={styles.timerWrap}>
          <ProtocolTimerRing
            size={theme.ringSize}
            progress={timer.progress}
            gradient={theme.gradient}
            coin={<ProtocolCoinBadge colors={theme.coinGradient} size={44} />}
          >
            <Text style={[styles.timerNum, { fontSize: theme.timerFontSize }]}>{timer.main}</Text>
            <Text style={[styles.timerSub, session.isOvertime && { color: theme.accent }]}>
              {timer.sub}
            </Text>
          </ProtocolTimerRing>
        </View>

        <Text style={styles.quote}>
          {theme.quote[0]}
          {'\n'}
          {theme.quote[1]}
        </Text>

        <ProtocolAppFeed protocol={protocol} hasFocusSelection={hasFocusSelection} />

        <View style={styles.foot}>
          <Text style={styles.footNote}>
            Tap your <Text style={styles.resetStrong}>Reset</Text> coin to pause or end the shift.
          </Text>

          {/* Always available, no justification asked. Ends everything on the
              spot and still banks the XP — leaving early is never punished. */}
          <HoldToConfirm label="Exit" onConfirm={() => void session.exitNow()} accent="#5C5C66" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A0A0C',
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  head: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 30,
  },
  protoTag: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  tagDot: {
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  tagLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.54,
    textTransform: 'uppercase',
  },
  eyebrow: {
    color: '#9A9AA2',
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 1.47,
  },
  timerWrap: {
    alignItems: 'center',
    paddingTop: 40,
  },
  timerNum: {
    color: '#F5F5F7',
    fontVariant: ['tabular-nums'],
    fontWeight: '200',
    letterSpacing: -2,
  },
  timerSub: {
    color: '#5C5C66',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.54,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  quote: {
    color: '#9A9AA2',
    fontSize: 14,
    fontWeight: '300',
    lineHeight: 24,
    marginTop: 40,
    paddingHorizontal: 40,
    textAlign: 'center',
  },
  foot: {
    gap: 14,
    marginTop: 'auto',
    paddingHorizontal: 28,
    paddingTop: 26,
  },
  footNote: {
    color: '#5C5C66',
    fontSize: 11.5,
    fontWeight: '300',
    lineHeight: 18,
    textAlign: 'center',
  },
  resetStrong: {
    color: '#D4855A',
    fontWeight: '600',
  },
});
