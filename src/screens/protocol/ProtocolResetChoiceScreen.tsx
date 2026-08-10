import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoldToConfirm } from '../../components/HoldToConfirm';
import { formatTimer } from '../../lib/protocolTheme';
import { useSession } from '../../providers/SessionProvider';

/**
 * Where the Reset coin lands. Both choices are always offered — the app never
 * guesses whether more blocks are coming, that is the user's call in the moment.
 */
export function ProtocolResetChoiceScreen() {
  const insets = useSafeAreaInsets();
  const session = useSession();

  const focusSeconds = session.shiftFocusMinutes * 60 + session.blockElapsedSeconds;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 }]}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>RESET</Text>
        <Text style={styles.title}>
          Take a break,{'\n'}
          <Text style={styles.titleLight}>or call it?</Text>
        </Text>
        <Text style={styles.meta}>
          {formatTimer(focusSeconds)} focused · block {session.blockIndex}
        </Text>
      </View>

      <View style={styles.choices}>
        <HoldToConfirm label="Pause" onConfirm={session.startPause} accent="#D4855A" />
        <HoldToConfirm
          label="End Shift"
          onConfirm={session.chooseEndShift}
          accent="#F5F5F7"
          inverted
        />
      </View>

      <Text style={styles.footNote}>
        Hold a button for three seconds. Let go to cancel.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A0A0C',
    flex: 1,
    paddingHorizontal: 28,
  },
  head: {
    alignItems: 'center',
  },
  eyebrow: {
    color: '#D4855A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  title: {
    color: '#F5F5F7',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.9,
    lineHeight: 36,
    marginTop: 14,
    textAlign: 'center',
  },
  titleLight: {
    color: '#9A9AA2',
    fontWeight: '200',
  },
  meta: {
    color: '#5C5C66',
    fontSize: 12,
    fontWeight: '300',
    marginTop: 12,
  },
  choices: {
    gap: 14,
    marginTop: 'auto',
  },
  footNote: {
    color: '#5C5C66',
    fontSize: 11.5,
    fontWeight: '300',
    marginTop: 18,
    textAlign: 'center',
  },
});
