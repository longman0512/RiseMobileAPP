module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // The codebase uses `void somePromise()` deliberately to mark a promise as
    // intentionally not awaited. Keep the rule for expression position, where
    // `void` really is a code smell.
    'no-void': ['warn', { allowAsStatement: true }],
  },
};
