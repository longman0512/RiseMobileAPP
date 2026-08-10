import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatTimer } from '../../lib/protocolTheme';
import { useSession } from '../../providers/SessionProvider';

/** 4 seconds in, 4 seconds out. */
const BREATH_MS = 4000;

function BreathingPulse() {
  const scale = useRef(new Animated.Value(0.72)).current;
  const glow = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: BREATH_MS,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glow, {
            toValue: 0.85,
            duration: BREATH_MS,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 0.72,
            duration: BREATH_MS,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glow, {
            toValue: 0.35,
            duration: BREATH_MS,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow, scale]);

  return (
    <View style={styles.pulseWrap} pointerEvents="none">
      <Animated.View style={[styles.pulse, { opacity: glow, transform: [{ scale }] }]}>
        <LinearGradient
          colors={['rgba(212,133,90,0.55)', 'rgba(212,133,90,0.12)', 'transparent']}
          style={styles.pulseGradient}
        />
      </Animated.View>
    </View>
  );
}

/**
 * The rest state. Apps stay blocked throughout — the shields are deliberately
 * not lifted here, only when the shift ends. Leaves only on a tap.
 */
export function ProtocolBreatheScreen() {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const done = session.pauseComplete;

  return (
    <Pressable
      style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30 }]}
      onPress={session.finishBreathing}
      accessibilityLabel="Tap to end the break"
    >
      <LinearGradient
        colors={['#12100D', '#0A0A0C', '#0A0A0C']}
        style={StyleSheet.absoluteFill}
      />
      <BreathingPulse />

      <View style={styles.head}>
        <Text style={styles.eyebrow}>{done ? 'BREAK COMPLETE' : 'BREATHE'}</Text>
      </View>

      <View style={styles.center}>
        <Text style={styles.timer}>{formatTimer(session.pauseRemainingSeconds)}</Text>
        <Text style={styles.rhythm}>{done ? 'Whenever you are ready.' : 'In for 4 · out for 4'}</Text>
        <Text style={styles.instruction}>{session.resetInstruction}</Text>
      </View>

      <View style={styles.foot}>
        <Text style={styles.footStrong}>
          {done ? 'Tap Lock In or Flow to resume' : 'Tap anywhere to end the break early'}
        </Text>
        <Text style={styles.footNote}>Your apps stay blocked until the shift ends.</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A0A0C',
    flex: 1,
    paddingHorizontal: 28,
  },
  pulseWrap: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  pulse: {
    height: 420,
    width: 420,
  },
  pulseGradient: {
    borderRadius: 210,
    flex: 1,
  },
  head: {
    alignItems: 'center',
  },
  eyebrow: {
    color: '#D4855A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  timer: {
    color: '#F5F5F7',
    fontSize: 62,
    fontVariant: ['tabular-nums'],
    fontWeight: '200',
    letterSpacing: -2,
  },
  rhythm: {
    color: '#9A9AA2',
    fontSize: 12.5,
    fontWeight: '300',
    letterSpacing: 1,
    marginTop: 8,
  },
  instruction: {
    color: '#F5F5F7',
    fontSize: 16,
    fontWeight: '300',
    lineHeight: 26,
    marginTop: 40,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
  foot: {
    alignItems: 'center',
    gap: 6,
  },
  footStrong: {
    color: '#F5F5F7',
    fontSize: 13,
    fontWeight: '600',
  },
  footNote: {
    color: '#5C5C66',
    fontSize: 11.5,
    fontWeight: '300',
  },
});
