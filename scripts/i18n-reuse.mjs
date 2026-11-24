#!/usr/bin/env node
// Fill empty translations in the phone app's catalogs from the web app's
// catalogs, where the English source text is the same. Never overwrites a
// translation that is already there.
//
//   node scripts/i18n-reuse.mjs [path-to-web-catalogs]
//
// Default web path: ../web/packages/client/components/i18n/catalogs
// (the web repo's working tree; check it is on an up-to-date branch).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const webDir = resolve(
  process.argv[2] ?? "../web/packages/client/components/i18n/catalogs",
);
const ownDir = resolve("src/i18n/locales");
const LOCALES = ["ar", "de", "es", "fr", "ru", "zh-Hans"];

/** Unquote a PO string line */
function unquote(line) {
  return JSON.parse(line.trim());
}

/** Read a PO file into a map msgid -> msgstr (ignores contexts and plurals) */
export function parsePo(text) {
  const map = new Map();
  let id = null;
  let str = null;
  let field = null;
  const flush = () => {
    if (id !== null && str !== null) map.set(id, str);
    id = str = field = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("msgid ")) {
      flush();
      id = unquote(line.slice(6));
      field = "id";
    } else if (line.startsWith("msgstr ")) {
      str = unquote(line.slice(7));
      field = "str";
    } else if (line.startsWith('"') && field) {
      if (field === "id") id += unquote(line);
      else str += unquote(line);
    } else if (line === "" || line.startsWith("#")) {
      if (line === "") flush();
      else field = null;
    }
  }
  flush();
  return map;
}

function quote(value) {
  return JSON.stringify(value);
}

let total = 0;
for (const locale of LOCALES) {
  const webFile = join(webDir, locale, "messages.po");
  const ownFile = join(ownDir, locale, "messages.po");
  if (!existsSync(webFile) || !existsSync(ownFile)) {
    console.error(`missing ${!existsSync(webFile) ? webFile : ownFile}`);
    process.exit(1);
  }
  const web = parsePo(readFileSync(webFile, "utf8"));
  const lines = readFileSync(ownFile, "utf8").split(/\r?\n/);
  let filled = 0;
  let empty = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("msgid ")) continue;
    let id = unquote(lines[i].slice(6));
    let j = i + 1;
    while (lines[j]?.startsWith('"')) id += unquote(lines[j++]);
    if (!lines[j]?.startsWith("msgstr ") || id === "") continue;
    // only a single-line empty msgstr counts as missing
    if (lines[j].trim() !== 'msgstr ""' || lines[j + 1]?.startsWith('"')) continue;
    const found = web.get(id);
    if (found) {
      lines[j] = `msgstr ${quote(found)}`;
      filled++;
    } else {
      empty++;
    }
  }
  writeFileSync(ownFile, lines.join("\n"));
  total += filled;
  console.log(`${locale}: ${filled} filled from the web catalog, ${empty} still empty`);
}
console.log(`total filled: ${total}`);
