module.exports = {
  preset: '@react-native/jest-preset',
  // Matches `npm start`: this project does not rely on watchman.
  watchman: false,
  // The preset only transforms `react-native/` itself. Everything else in the
  // RN ecosystem ships untranspiled ESM, so any module reachable from a test
  // (supabase pulls in react-native-url-polyfill, for example) has to be listed
  // here or Jest chokes on the first `import` statement.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community|-async-storage|-picker)?|react-native-.*|@react-navigation|@supabase|@notifee|lucide-react-native|nativewind|react-native-css-interop)/)',
  ],
};
