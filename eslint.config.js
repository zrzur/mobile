// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "coverage/*", ".expo/*", "src/i18n/locales/**/*.ts"],
  },
  {
    rules: {
      // Zrzur: no native <select>-like pickers or colour literals outside the tokens are checked in review
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "react-native", importNames: ["Picker"], message: "Use the design-system Choice." }] },
      ],
    },
  },
]);
