import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProtocolAppFeed } from '../../components/protocol/ProtocolAppFeed';
import { ProtocolCoinBadge } from '../../components/protocol/ProtocolCoinBadge';
import { ProtocolTimerRing } from '../../components/protocol/ProtocolTimerRing';
import { hasFocusModeSelection } from '../../lib/focusMode';
import type { ProtocolStackParamList } from '../../navigation/protocol/ProtocolNavigator';
import { formatTimer, PROTOCOL_THEME } from '../../lib/protocolTheme';
import { useSession } from '../../providers/SessionProvider';
import { COIN_LABELS, type CoinType } from '../../types/coins';

type Props = NativeStackScreenProps<ProtocolStackParamList, 'Active'>;

function sessionEyebrow(
  protocol: CoinType,
  segmentIndex: number,
  plannedMinutes: number,
  pausedFlow: boolean,
): string {
  if (protocol === 'reset') {
    const duration = formatTimer(plannedMinutes * 60);
    return pausedFlow ? `${duration} · paused Flow` : duration;
  }
  return `Session · ${String(segmentIndex).padStart(2, '0')}`;
}

function timerState(
  protocol: CoinType,
  phase: 'active' | 'overtime' | string,
  plannedMinutes: number,
  timeRemainingSeconds: number,
  overtimeSeconds: number,
  elapsedSeconds: number,
) {
  const totalSeconds = plannedMinutes * 60;

  if (protocol === 'flow') {
    return {
      main: formatTimer(elapsedSeconds),
      sub: 'elapsed · open end',
      progress: Math.min(1, elapsedSeconds / totalSeconds),
    };
  }

  const remaining = phase === 'overtime' ? 0 : timeRemainingSeconds;
  const elapsed = totalSeconds - remaining;
  return {
    main: formatTimer(remaining),
    sub: protocol === 'lockin' ? `of ${formatTimer(totalSeconds)}` : undefined,
    progress: totalSeconds > 0 ? elapsed / totalSeconds : 0,
  };
}

function FlowFootnote() {
  return (
    <Text style={styles.footNote}>
      Tap <Text style={styles.copperStrong}>Reset</Text> to pause · tap{' '}
      <Text style={styles.brassStrong}>Flow</Text> again to resume
    </Text>
  );
}

function ResetFootnote() {
  return (
    <Text style={styles.footNote}>
      No feeds. No noise. Just a breath.{'\n'}
      Tap <Text style={styles.brassStrong}>Flow</Text> or{' '}
      <Text style={styles.steelStrong}>Lock In</Text> to end early.
    </Text>
  );
}

function ResetReflection({
  note,
  nextBlock,
  onNoteChange,
  onNextBlockChange,
}: {
  note: string;
  nextBlock: string;
  onNoteChange: (text: string) => void;
  onNextBlockChange: (text: string) => void;
}) {
  return (
    <View style={styles.reflect}>
      <View style={styles.reflectCard}>
        <Text style={styles.reflectQ}>What did you accomplish?</Text>
        <TextInput
          style={styles.reflectInput}
          placeholder="Type or write it in your notebook…"
          placeholderTextColor="#5C5C66"
          value={note}
          onChangeText={onNoteChange}
          multiline
          textAlignVertical="top"
        />
      </View>
      <View style={styles.reflectCard}>
        <Text style={styles.reflectQ}>What's next?</Text>
        <TextInput
          style={styles.reflectInput}
          placeholder="Type or write it in your notebook…"
          placeholderTextColor="#5C5C66"
          value={nextBlock}
          onChangeText={onNextBlockChange}
          multiline
          textAlignVertical="top"
        />
      </View>
    </View>
  );
}

export function ProtocolActiveScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const protocol = session.activeProtocol ?? route.params.protocol;
  const theme = PROTOCOL_THEME[protocol];

  const [hasFocusSelection, setHasFocusSelection] = useState(false);

  useEffect(() => {
    if (protocol === 'reset') return;
    let cancelled = false;
    void hasFocusModeSelection(protocol).then((value) => {
      if (!cancelled) setHasFocusSelection(value);
    });
    return () => {
      cancelled = true;
    };
  }, [protocol]);

  const pausedFlow = session.pausedFlowRemainingSeconds != null;
  const eyebrow = sessionEyebrow(
    protocol,
    session.segmentIndex,
    session.plannedMinutes,
    pausedFlow,
  );

  const timer = useMemo(
    () =>
      timerState(
        protocol,
        session.phase,
        session.plannedMinutes,
        session.timeRemainingSeconds,
        session.overtimeSeconds,
        session.elapsedSeconds,
      ),
    [
      protocol,
      session.phase,
      session.plannedMinutes,
      session.timeRemainingSeconds,
      session.overtimeSeconds,
      session.elapsedSeconds,
    ],
  );

  const isReset = protocol === 'reset';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.head}>
          <View style={styles.protoTag}>
            <View style={[styles.tagDot, { backgroundColor: theme.accent }]} />
            <Text style={[styles.tagLabel, { color: theme.accent }]}>{COIN_LABELS[protocol]}</Text>
          </View>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
        </View>

        <View style={[styles.timerWrap, isReset && styles.timerWrapReset]}>
          <ProtocolTimerRing
            size={theme.ringSize}
            progress={timer.progress}
            gradient={theme.gradient}
            coin={<ProtocolCoinBadge colors={theme.coinGradient} size={isReset ? 36 : 44} />}
          >
            <Text style={[styles.timerNum, { fontSize: theme.timerFontSize }]}>{timer.main}</Text>
            {timer.sub ? <Text style={styles.timerSub}>{timer.sub}</Text> : null}
          </ProtocolTimerRing>
        </View>

        {!isReset ? (
          <>
            <Text style={styles.quote}>
              {theme.quote[0]}
              {'\n'}
              {theme.quote[1]}
            </Text>
            <ProtocolAppFeed protocol={protocol} hasFocusSelection={hasFocusSelection} />
          </>
        ) : (
          <ResetReflection
            note={session.journalNote}
            nextBlock={session.journalNextBlock}
            onNoteChange={session.setJournalNote}
            onNextBlockChange={session.setJournalNextBlock}
          />
        )}

        <View style={styles.foot}>
          {protocol === 'lockin' ? (
            <Text style={styles.footNote}>{theme.footnote}</Text>
          ) : protocol === 'flow' ? (
            <FlowFootnote />
          ) : (
            <ResetFootnote />
          )}
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
    paddingBottom: 30,
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
    textTransform: 'uppercase',
  },
  timerWrap: {
    alignItems: 'center',
    paddingTop: 40,
  },
  timerWrapReset: {
    paddingTop: 28,
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
    marginTop: 46,
    paddingHorizontal: 40,
    textAlign: 'center',
  },
  reflect: {
    gap: 14,
    marginHorizontal: 28,
    marginTop: 30,
  },
  reflectCard: {
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  reflectQ: {
    color: '#D4855A',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.32,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  reflectInput: {
    color: '#F5F5F7',
    fontSize: 14,
    fontWeight: '300',
    lineHeight: 23,
    minHeight: 48,
    padding: 0,
  },
  foot: {
    gap: 12,
    marginTop: 'auto',
    paddingHorizontal: 28,
    paddingTop: 24,
  },
  footNote: {
    color: '#5C5C66',
    fontSize: 11.5,
    fontWeight: '300',
    lineHeight: 18,
    textAlign: 'center',
  },
  brassStrong: {
    color: '#E8C56A',
    fontWeight: '600',
  },
  steelStrong: {
    color: '#C0C4CC',
    fontWeight: '600',
  },
  copperStrong: {
    color: '#D4855A',
    fontWeight: '600',
  },
});
