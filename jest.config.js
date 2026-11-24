// Jest: the jest-expo preset, plus .mjs files (Lingui 6 ships ES modules only)
const preset = require("jest-expo/jest-preset");

module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.{ts,tsx}"],
  transformIgnorePatterns: ["node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|@zrzur/.*|solid-js|@solid-primitives/.*|@vladfrangu/.*|json-with-bigint|ulid|@lingui/.*|@messageformat/.*|nativewind|react-native-css-interop)"],
  moduleNameMapper: {
    "^solid-js$": "<rootDir>/node_modules/solid-js/dist/solid.cjs",
    "^solid-js/store$": "<rootDir>/node_modules/solid-js/store/dist/store.cjs",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@vladfrangu/async_event_emitter$": "<rootDir>/src/shims/async-event-emitter.ts",
    // import-only packages: point Jest (require) at their builds
    "^@solid-primitives/(map|set|trigger|utils)$": "<rootDir>/node_modules/@solid-primitives/$1/dist/index.js"
  },
  // Reanimated and worklets are mocked in jest.setup.js
  setupFiles: [...(preset.setupFiles ?? []), "<rootDir>/jest.setup.js"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "mjs", "cjs"],
  transform: {
    ...preset.transform,
    "\\.mjs$": preset.transform["\\.[jt]sx?$"],
  },
};
