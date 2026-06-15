import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

let NativeLinearGradient: null | React.ComponentType<{
  colors: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: unknown;
}> = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NativeLinearGradient = require('react-native-linear-gradient').default;
} catch {
  NativeLinearGradient = null;
}

const styles = StyleSheet.create({
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.46,
    shadowRadius: 16,
    elevation: 8,
  },
  cardShadowSoft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
  },
  cardClip: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardBackground: {
    ...StyleSheet.absoluteFill,
  },
  cardContent: {
    padding: 16,
  },
});

export function DashboardCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={className} style={[styles.cardShadow, styles.cardShadowSoft]}>
      <View className="border border-white/10 rounded-2xl" style={styles.cardClip}>
        {NativeLinearGradient ? (
          <NativeLinearGradient
            colors={['rgba(30, 29, 29, 0.98)', 'rgba(16, 16, 16, 0.96)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.cardBackground}
          />
        ) : (
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 1 1"
            style={styles.cardBackground}
            preserveAspectRatio="none"
            pointerEvents="none"
          >
            <Defs>
              <LinearGradient id="cardGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="rgba(30, 29, 29, 0.98)" />
                <Stop offset="0.18" stopColor="rgba(28, 27, 27, 0.98)" />
                <Stop offset="0.35" stopColor="rgba(26, 25, 25, 0.98)" />
                <Stop offset="0.52" stopColor="rgba(23, 23, 23, 0.97)" />
                <Stop offset="0.68" stopColor="rgba(20, 20, 20, 0.97)" />
                <Stop offset="0.84" stopColor="rgba(18, 18, 18, 0.96)" />
                <Stop offset="1" stopColor="rgba(16, 16, 16, 0.96)" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="1" height="1" fill="url(#cardGradient)" />
          </Svg>
        )}

        <View style={styles.cardContent}>{children}</View>
      </View>
    </View>
  );
}
