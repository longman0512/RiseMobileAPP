import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

/** "3 second tap to confirm" from the spec, read as press-and-hold. */
export const HOLD_DURATION_MS = 3000;

type Props = {
  label: string;
  onConfirm: () => void;
  /** Fill and text colour. Defaults to the app's off-white. */
  accent?: string;
  /** Dark text on a light fill (primary action) vs light text on a dark fill. */
  inverted?: boolean;
  disabled?: boolean;
};

/**
 * Hold for three seconds to commit. Deliberate friction: every state change in
 * a shift should be chosen, never fat-fingered. Releasing early rewinds the
 * progress bar so a slip costs nothing.
 */
export function HoldToConfirm({
  label,
  onConfirm,
  accent = '#F5F5F7',
  inverted = false,
  disabled = false,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const start = useCallback(() => {
    if (disabled || firedRef.current) return;

    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_DURATION_MS,
      easing: Easing.linear,
      // Width cannot be driven natively; this bar is cheap enough on the JS thread.
      useNativeDriver: false,
    }).start();

    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      Vibration.vibrate(30);
      onConfirm();
    }, HOLD_DURATION_MS);
  }, [disabled, onConfirm, progress]);

  const cancel = useCallback(() => {
    if (firedRef.current) return;
    clearTimer();
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [clearTimer, progress]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const textColor = inverted ? '#0A0A0C' : accent;

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Hold for three seconds to confirm.`}
      style={[
        styles.root,
        { borderColor: accent },
        inverted ? { backgroundColor: accent } : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {/* Fill sweeps left to right while held. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fill,
          { width, backgroundColor: inverted ? 'rgba(0,0,0,0.16)' : `${accent}26` },
        ]}
      />
      <View style={styles.content} pointerEvents="none">
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: 14,
    borderWidth: 1,
    height: 52,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  fill: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
