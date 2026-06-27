import React from 'react';
import { StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

type Props = {
  colors: [string, string, string];
  size?: number;
};

export function ProtocolCoinBadge({ colors, size = 44 }: Props) {
  return (
    <View style={[styles.shadow, { width: size, height: size, borderRadius: size / 2 }]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.coin, { width: size, height: size, borderRadius: size / 2 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 8,
  },
  coin: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
});
