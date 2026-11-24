import { defineConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";

// Same message ids as the web app (source strings), so translations that
// already exist there are reused: `npm run i18n:reuse`.
export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "ar", "de", "es", "fr", "ru", "zh-Hans"],
  catalogs: [
    {
      path: "<rootDir>/src/i18n/locales/{locale}/messages",
      include: ["src"],
      exclude: ["**/node_modules/**", "**/i18n/locales/**"],
    },
  ],
  format: formatter({ origins: true, lineNumbers: false }),
  compileNamespace: "ts",
});
