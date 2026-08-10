import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  suggestPauseMinutes,
  TIREDNESS_LABELS,
  TIREDNESS_LEVELS,
  type TirednessLevel,
} from '../../lib/pauseDuration';
import { useSession } from '../../providers/SessionProvider';

/** Biofeedback check-in. The answer sizes the pause. */
export function ProtocolTirednessScreen() {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const [selected, setSelected] = useState<TirednessLevel | null>(session.tiredness);

  const lastBlock = session.shiftBlocks[session.shiftBlocks.length - 1];
  const preview =
    selected == null
      ? null
      : suggestPauseMinutes({
          tiredness: selected,
          shiftFocusMinutes: session.shiftFocusMinutes,
          cameFromOvertime: (lastBlock?.overtimeMins ?? 0) > 0,
        });

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 }]}>
      <View>
        <Text style={styles.eyebrow}>CHECK IN</Text>
        <Text style={styles.title}>
          How tired{'\n'}
          <Text style={styles.titleLight}>are you?</Text>
        </Text>
        <Text style={styles.sub}>1 is fresh, 5 is running on empty.</Text>
      </View>

      <View style={styles.scale}>
        {TIREDNESS_LEVELS.map((level) => {
          const active = selected === level;
          return (
            <Pressable
              key={level}
              style={[styles.level, active ? styles.levelActive : null]}
              onPress={() => setSelected(level)}
              accessibilityLabel={`${level}, ${TIREDNESS_LABELS[level]}`}
            >
              <Text style={[styles.levelNum, active ? styles.levelNumActive : null]}>{level}</Text>
              <Text style={[styles.levelLabel, active ? styles.levelLabelActive : null]}>
                {TIREDNESS_LABELS[level]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        {preview != null ? (
          <Text style={styles.preview}>
            Suggested pause: <Text style={styles.previewStrong}>{preview} min</Text>
          </Text>
        ) : (
          <Text style={styles.preview}>Pick a number to size your break.</Text>
        )}

        <Pressable
          style={[styles.continueButton, selected == null && styles.continueDisabled]}
          disabled={selected == null}
          onPress={() => selected != null && session.chooseTiredness(selected)}
        >
          <Text style={styles.continueText}>Continue</Text>
        </Pressable>
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
  },
  titleLight: {
    color: '#9A9AA2',
    fontWeight: '200',
  },
  sub: {
    color: '#5C5C66',
    fontSize: 13,
    fontWeight: '300',
    marginTop: 10,
  },
  scale: {
    gap: 10,
    marginTop: 32,
  },
  level: {
    alignItems: 'center',
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  levelActive: {
    borderColor: '#D4855A',
  },
  levelNum: {
    color: '#5C5C66',
    fontSize: 18,
    fontWeight: '700',
    width: 18,
  },
  levelNumActive: {
    color: '#D4855A',
  },
  levelLabel: {
    color: '#9A9AA2',
    fontSize: 14,
    fontWeight: '300',
  },
  levelLabelActive: {
    color: '#F5F5F7',
    fontWeight: '500',
  },
  footer: {
    marginTop: 'auto',
  },
  preview: {
    color: '#9A9AA2',
    fontSize: 13,
    fontWeight: '300',
    marginBottom: 14,
    textAlign: 'center',
  },
  previewStrong: {
    color: '#F5F5F7',
    fontWeight: '700',
  },
  continueButton: {
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
  },
  continueDisabled: {
    opacity: 0.35,
  },
  continueText: {
    color: '#0A0A0C',
    fontSize: 14.5,
    fontWeight: '600',
  },
});
