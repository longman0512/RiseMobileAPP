const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Watchman cannot read ~/Downloads on many macOS setups ("Operation not permitted").
const config = {
  resolver: {
    useWatchman: false,
  },
};

module.exports = withNativeWind(mergeConfig(getDefaultConfig(__dirname), config), {
  input: './global.css',
});
