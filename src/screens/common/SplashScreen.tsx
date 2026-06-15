import React from 'react';
import { Image, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LOGO = require('../../assets/apple-icon.png');

const TAGLINE = 'Three coins. Three states. One decision.';

export function SplashScreen() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const contentHeight = height - insets.top - insets.bottom;
  const logoCenterY = insets.top + contentHeight / 3;
  const logoSize = Math.min(160, Math.round(contentHeight * 0.14));

  return (
    <View className="absolute inset-0 bg-black" pointerEvents="auto">
      <Image
        source={LOGO}
        accessibilityLabel="RISE"
        resizeMode="contain"
        style={{
          position: 'absolute',
          width: logoSize,
          height: logoSize,
          left: '50%',
          marginLeft: -logoSize / 2,
          top: logoCenterY - logoSize / 2,
        }}
      />

      <View
        className="absolute left-0 right-0 items-center justify-center px-10"
        style={{ top: insets.top, height: contentHeight }}
      >
        <Text className="text-center text-xl leading-8 text-zinc-300 font-medium">
          {TAGLINE}
        </Text>
      </View>
    </View>
  );
}
