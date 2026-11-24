#!/usr/bin/env node
// Fill empty translations from a JSON file:
//   { "<English>": { "ar": "...", "de": "...", "es": "...", ... } }
// (the older form { "<English>": ["<ar>", "<de>"] } still works).
// Never overwrites an existing translation.   node scripts/i18n-fill.mjs <file.json>
import { readFileSync, writeFileSync } from "node:fs";

const LOCALES = ["ar", "de", "es", "fr", "ru", "zh-Hans"];
const table = JSON.parse(readFileSync(process.argv[2], "utf8"));
const pick = (row, locale) =>
  Array.isArray(row) ? row[["ar", "de"].indexOf(locale)] : row?.[locale];

for (const locale of LOCALES) {
  const file = `src/i18n/locales/${locale}/messages.po`;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  let filled = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("msgid ")) continue;
    let id = JSON.parse(lines[i].slice(6));
    let j = i + 1;
    while (lines[j]?.startsWith('"')) id += JSON.parse(lines[j++]);
    if (lines[j]?.trim() !== 'msgstr ""' || lines[j + 1]?.startsWith('"')) continue;
    const value = pick(table[id], locale);
    if (value) {
      lines[j] = `msgstr ${JSON.stringify(value)}`;
      filled++;
    }
  }
  writeFileSync(file, lines.join("\n"));
  console.log(`${locale}: ${filled} filled`);
}
