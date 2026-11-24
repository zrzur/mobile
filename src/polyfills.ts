/**
 * What the SDK and the app expect from a browser but Hermes (the phone's
 * engine) does not have. Imported first, before anything else loads.
 *
 * - crypto.getRandomValues: `ulid` (message ids) needs it; Expo's crypto
 *   module gives secure random bytes on Android and iOS.
 * - Intl: Hermes has DateTimeFormat and a basic NumberFormat, but no
 *   PluralRules (Lingui plurals crash with "undefined cannot be used as a
 *   constructor"), RelativeTimeFormat, ListFormat or DisplayNames. The
 *   formatjs `polyfill` entries install themselves only where a feature is
 *   missing, so browsers keep their own; the locale data covers the seven
 *   app languages. Order matters: each one builds on the ones before it.
 */
import { getRandomValues } from "expo-crypto";

import "@formatjs/intl-getcanonicallocales/polyfill.js";
import "@formatjs/intl-locale/polyfill.js";

import "@formatjs/intl-pluralrules/polyfill.js";
import "@formatjs/intl-pluralrules/locale-data/ar.js";
import "@formatjs/intl-pluralrules/locale-data/de.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import "@formatjs/intl-pluralrules/locale-data/es.js";
import "@formatjs/intl-pluralrules/locale-data/fr.js";
import "@formatjs/intl-pluralrules/locale-data/ru.js";
import "@formatjs/intl-pluralrules/locale-data/zh.js";

import "@formatjs/intl-numberformat/polyfill.js";
import "@formatjs/intl-numberformat/locale-data/ar.js";
import "@formatjs/intl-numberformat/locale-data/de.js";
import "@formatjs/intl-numberformat/locale-data/en.js";
import "@formatjs/intl-numberformat/locale-data/es.js";
import "@formatjs/intl-numberformat/locale-data/fr.js";
import "@formatjs/intl-numberformat/locale-data/ru.js";
import "@formatjs/intl-numberformat/locale-data/zh.js";
import "@formatjs/intl-numberformat/locale-data/zh-Hans.js";

import "@formatjs/intl-relativetimeformat/polyfill.js";
import "@formatjs/intl-relativetimeformat/locale-data/ar.js";
import "@formatjs/intl-relativetimeformat/locale-data/de.js";
import "@formatjs/intl-relativetimeformat/locale-data/en.js";
import "@formatjs/intl-relativetimeformat/locale-data/es.js";
import "@formatjs/intl-relativetimeformat/locale-data/fr.js";
import "@formatjs/intl-relativetimeformat/locale-data/ru.js";
import "@formatjs/intl-relativetimeformat/locale-data/zh.js";
import "@formatjs/intl-relativetimeformat/locale-data/zh-Hans.js";

import "@formatjs/intl-listformat/polyfill.js";
import "@formatjs/intl-listformat/locale-data/ar.js";
import "@formatjs/intl-listformat/locale-data/de.js";
import "@formatjs/intl-listformat/locale-data/en.js";
import "@formatjs/intl-listformat/locale-data/es.js";
import "@formatjs/intl-listformat/locale-data/fr.js";
import "@formatjs/intl-listformat/locale-data/ru.js";
import "@formatjs/intl-listformat/locale-data/zh.js";
import "@formatjs/intl-listformat/locale-data/zh-Hans.js";

import "@formatjs/intl-displaynames/polyfill.js";
import "@formatjs/intl-displaynames/locale-data/ar.js";
import "@formatjs/intl-displaynames/locale-data/de.js";
import "@formatjs/intl-displaynames/locale-data/en.js";
import "@formatjs/intl-displaynames/locale-data/es.js";
import "@formatjs/intl-displaynames/locale-data/fr.js";
import "@formatjs/intl-displaynames/locale-data/ru.js";
import "@formatjs/intl-displaynames/locale-data/zh.js";
import "@formatjs/intl-displaynames/locale-data/zh-Hans.js";

const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== "function") {
  g.crypto.getRandomValues = getRandomValues;
}
