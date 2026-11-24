import { i18n } from "@lingui/core";
import { getLocales } from "expo-localization";
import { I18nManager, Platform } from "react-native";
import * as Updates from "expo-updates";

import { secureStorage } from "@/lib/secureStorage";

import { messages as ar } from "./locales/ar/messages";
import { messages as de } from "./locales/de/messages";
import { messages as en } from "./locales/en/messages";
import { messages as es } from "./locales/es/messages";
import { messages as fr } from "./locales/fr/messages";
import { messages as ru } from "./locales/ru/messages";
import { messages as zhHans } from "./locales/zh-Hans/messages";
import { type Locale, isRtl, pickLocale } from "./locale";

const LOCALE_KEY = "zrzur.locale";

i18n.load({ ar, de, en, es, fr, ru, "zh-Hans": zhHans });

/** Load the saved or device language and line the layout direction up with it */
export async function initI18n(): Promise<{ locale: Locale; reload: boolean }> {
  const saved = await secureStorage.get(LOCALE_KEY);
  const locale = pickLocale(
    saved,
    getLocales().map((l) => l.languageTag),
  );
  i18n.activate(locale);
  return { locale, reload: applyDirection(locale) };
}

/**
 * Right-to-left for Arabic. On a phone the layout direction is fixed when the
 * app starts, so a change needs one reload; returns whether it does.
 */
function applyDirection(locale: Locale): boolean {
  const rtl = isRtl(locale);
  if (Platform.OS === "web") {
    if (typeof document !== "undefined") {
      document.documentElement.dir = rtl ? "rtl" : "ltr";
      document.documentElement.lang = locale;
    }
    return false;
  }
  I18nManager.allowRTL(true);
  // keep "left" and "right" in styles as written; we use start/end instead
  I18nManager.swapLeftAndRightInRTL(true);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    return true;
  }
  return false;
}

/** Switch language; reloads the app when the direction changes */
export async function changeLocale(locale: Locale): Promise<void> {
  await secureStorage.set(LOCALE_KEY, locale);
  i18n.activate(locale);
  if (applyDirection(locale)) await reloadApp();
}

export async function reloadApp(): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.location?.reload();
    return;
  }
  await Updates.reloadAsync();
}

export { i18n };
