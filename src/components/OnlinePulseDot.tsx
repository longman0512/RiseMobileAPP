import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const DURATION_MS = 1200;
const STAGGER_MS = 400;
const RING_SCALE_TO = 2.2;

function PulseRing({ delayMs }: { delayMs: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: RING_SCALE_TO,
            duration: DURATION_MS,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: DURATION_MS,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.7,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    loopRef.current = animation;
    animation.start();

    return () => {
      animation.stop();
      loopRef.current = null;
    };
  }, [delayMs, opacity, scale]);

  return (
    <Animated.View
      style={[
        styles.ring,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

export function OnlinePulseDot() {
  return (
    <View style={styles.container}>
      <PulseRing delayMs={0} />
      <PulseRing delayMs={STAGGER_MS} />
      <View className="h-3 w-3 rounded-full bg-green-500 border-2 border-green-300" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(134, 239, 172, 0.8)',
    backgroundColor: 'rgba(34, 197, 94, 0.35)',
  },
});
