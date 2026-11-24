/**
 * Zrzur's own profile looks (web ui/components/features/profiles/userStyle.ts,
 * nameStyles.ts, effects/effectIds.ts). The server accepts only these ids
 * and `#rrggbb` colours. The phone offers the built-in sets; a design the
 * person already wears from the pack or the community stays selected.
 */

/** Built-in avatar decorations (art: app.zrzur.com/decorations/<id>.svg) */
export const DECORATIONS = [
  "laurel", "light-crown", "rings", "ivy", "thorn-roses", "ice-crystal", "flame-ring", "lightning",
  "moon-halo", "sun-rays", "star-orbit", "sakura-branch", "geometric-hex", "neon", "wings", "feathers",
  "gear", "circuit", "waves", "leaves", "snow", "hearts", "music-notes", "shield-frame",
] as const;

export type NameplateGroup = "arab" | "flag" | "theme" | "zodiac";

const PLATE_THEMES = ["aurora", "autumn", "sakura", "ocean", "clouds", "sunset", "midnight", "mint"];
const PLATE_SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const PLATE_ARAB = ["dz", "bh", "km", "dj", "eg", "iq", "jo", "kw", "lb", "ly", "mr", "ma", "om", "ps", "qa", "sa", "so", "sd", "sy", "tn", "ae", "ye"];
const PLATE_WORLD = [
  "ad", "af", "ag", "al", "am", "ao", "ar", "at", "au", "az", "ba", "bb", "bd", "be", "bf", "bg", "bi", "bj", "bn", "bo", "br", "bs", "bt", "bw", "by", "bz",
  "ca", "cd", "cf", "cg", "ch", "ci", "cl", "cm", "cn", "co", "cr", "cu", "cv", "cy", "cz", "de", "dk", "dm", "do", "ec", "ee", "er", "es", "et", "fi", "fj", "fm",
  "fr", "ga", "gb", "gb-eng", "gb-sct", "gd", "ge", "gh", "gm", "gn", "gq", "gr", "gt", "gw", "gy", "hn", "hr", "ht", "hu", "id", "ie", "in", "ir", "is", "it",
  "jm", "jp", "ke", "kg", "kh", "ki", "kn", "kp", "kr", "kurdistan", "kz", "la", "lc", "li", "lk", "lr", "ls", "lt", "lu", "lv", "mc", "md", "me", "mg", "mh",
  "mk", "ml", "mm", "mn", "mt", "mu", "mv", "mw", "mx", "my", "mz", "na", "ne", "ng", "ni", "nl", "no", "np", "nr", "nz", "pa", "pe", "pg", "ph", "pk", "pl",
  "pt", "pw", "py", "ro", "rs", "ru", "rw", "sb", "sc", "se", "sg", "si", "sk", "sl", "sm", "sn", "sr", "ss", "st", "sv", "sz", "td", "tg", "th", "tj", "tl",
  "tm", "to", "tr", "tt", "tv", "tz", "ua", "ug", "us", "uy", "uz", "va", "vc", "ve", "vn", "vu", "ws", "za", "zm", "zw",
];

/** Built-in nameplates (art: app.zrzur.com/nameplates/<id>.svg) */
export const NAMEPLATES: { id: string; group: NameplateGroup }[] = [
  ...PLATE_ARAB.map((id) => ({ id: `flag-${id}`, group: "arab" as const })),
  ...PLATE_WORLD.map((id) => ({ id: `flag-${id}`, group: "flag" as const })),
  ...PLATE_THEMES.map((id) => ({ id, group: "theme" as const })),
  ...PLATE_SIGNS.map((id) => ({ id: `zodiac-${id}`, group: "zodiac" as const })),
];

/** Zrzur's own profile effects */
export const EFFECTS = [
  "snow", "rain", "confetti", "sparks", "petals", "bubbles", "leaves", "fireflies", "ripples", "kites", "aurora", "starfall", "lanterns", "sakura", "embers",
  "planes", "butterflies", "ink", "shards", "comet", "glass-rain", "dust", "sunrays", "moons", "bloom", "waves", "burst", "feathers", "dandelions", "hearts",
] as const;

/**
 * Display-name fonts. The phone has none of the web fonts, so each draws
 * with the nearest system face; what is saved is the id.
 */
export const NAME_FONTS: { id: string; family?: "serif" | "monospace"; weight?: "700" | "800"; upper?: number; italic?: boolean }[] = [
  { id: "default" },
  { id: "bold", weight: "800" },
  { id: "serif", family: "serif", weight: "700" },
  { id: "mono", family: "monospace", weight: "700" },
  { id: "script", weight: "700", italic: true },
  { id: "pixel", family: "monospace", weight: "800", upper: 0.08 },
  { id: "wide", weight: "800", upper: 0.14 },
  { id: "rounded", weight: "800" },
  { id: "geo", weight: "700" },
  { id: "modern", weight: "700" },
  { id: "elegant", weight: "700" },
  { id: "strong", weight: "800" },
  { id: "clear", weight: "700" },
  { id: "soft", weight: "700" },
  { id: "slab", family: "serif", weight: "700" },
  { id: "classic", family: "serif", weight: "700" },
  { id: "comic", weight: "700", italic: true },
  { id: "typewriter", family: "monospace", weight: "700" },
  { id: "code", family: "monospace", weight: "700" },
  { id: "kufi", weight: "700" },
];

export const NAME_SOLIDS = [
  "#ffffff", "#d7dbea", "#ff8a80", "#ff6b4a", "#ff9a44", "#ffb347", "#ffd200", "#f4e285", "#c5e86c", "#7ee081", "#38d39f", "#5de0c8",
  "#6dd5ed", "#3ec6e0", "#7fb8ff", "#a5b4ff", "#b794ff", "#ae78ff", "#d58bff", "#f08cf0", "#ff8ac4", "#ff5c8a", "#ffb3c7", "#e8c39e",
];

export const NAME_GRADIENTS: [string, string][] = [["#ff9a44","#ffcc33"],["#ff6b4a","#ffb347"],["#ff7a59","#ffd166"],["#ff8a80","#ffd180"],["#ffb199","#ff6f91"],["#ff5c8a","#ffb347"],["#ffd200","#ff9a44"],["#fff27a","#ff9e6d"],["#ffe29f","#ff8fa3"],["#f7c59f","#ef8a62"],["#ff6a88","#ff99ac"],["#ff758c","#ff7eb3"],["#ff5c8a","#ff99dd"],["#ff8ac4","#ffc2e0"],["#f093fb","#f5576c"],["#ff7eb3","#ae78ff"],["#ff6b4a","#ae78ff"],["#ff9ecb","#ffd9a0"],["#ffb3c7","#c6a6ff"],["#ff8fb1","#7fb8ff"],["#b794ff","#ff8ac4"],["#ae78ff","#6dd5ed"],["#c084fc","#f472b6"],["#a78bfa","#60a5fa"],["#d58bff","#7fb8ff"],["#c6a6ff","#a5f3fc"],["#e0aaff","#ffb3c7"],["#b197fc","#ffd43b"],["#9d8cff","#5de0c8"],["#d8b4fe","#fde68a"],["#6dd5ed","#a5b4ff"],["#4fc3f7","#b794ff"],["#7fb8ff","#5de0c8"],["#60a5fa","#a5f3fc"],["#74b9ff","#ffeaa7"],["#8ec5fc","#e0c3fc"],["#89f7fe","#66a6ff"],["#a1c4fd","#c2e9fb"],["#5ee7df","#a18cd1"],["#6dd5ed","#ff9ecb"],["#38ef7d","#a8ff78"],["#38d39f","#c5e86c"],["#5de0c8","#b8f5a0"],["#43e97b","#38f9d7"],["#96e6a1","#d4fc79"],["#7ee081","#6dd5ed"],["#c5e86c","#ffd200"],["#84fab0","#8fd3f4"],["#a8e063","#56d6a0"],["#d4fc79","#96e6a1"],["#ffe7a3","#f5c24f"],["#fff1b8","#e6b980"],["#e8c39e","#ffd9c0"],["#f6d365","#fda085"],["#d7dbea","#ffffff"],["#c9d6ff","#e2e2e2"],["#bdc3d7","#f5f7fa"],["#ffecd2","#fcb69f"],["#fbc2eb","#a6c1ee"],["#fdfbfb","#ebedee"]];

/** Ready-made two-colour profile themes (label = name) */
export const THEME_PRESETS: { id: string; colours: [string, string] }[] = [
  { id: "Sunset", colours: ["#ff6b4a", "#ffb347"] },
  { id: "Ocean", colours: ["#1e9bb8", "#6fd3e8"] },
  { id: "Grape", colours: ["#8b2be2", "#e0218a"] },
  { id: "Mint", colours: ["#11998e", "#38ef7d"] },
  { id: "Midnight", colours: ["#0f2027", "#2c5364"] },
  { id: "Cherry", colours: ["#eb3349", "#f45c43"] },
  { id: "Gold", colours: ["#f7971e", "#ffd200"] },
  { id: "Aurora", colours: ["#00c6ff", "#0072ff"] },
  { id: "Rose", colours: ["#ff9a9e", "#fecfef"] },
  { id: "Forest", colours: ["#134e5e", "#71b280"] },
  { id: "Neon", colours: ["#00f260", "#0575e6"] },
  { id: "Candy", colours: ["#ff758c", "#ff7eb3"] },
];

export const THEME_MAIN_DEFAULT = "#E0195F";
export const THEME_SECOND_DEFAULT = "#1d1f2b";

/** Where the web app keeps the built-in art (Zrzur's own server) */
export const ART_ORIGIN = "https://app.zrzur.com";
export const decorationArt = (id: string) => `${ART_ORIGIN}/decorations/${id}.svg`;
export const nameplateArt = (id: string) => `${ART_ORIGIN}/nameplates/${id}.svg`;

/** `c:<id>`: a design from the community gallery */
export const isCommunityRef = (value: string | undefined) => !!value && value.startsWith("c:");

export const HEX = /^#[0-9a-fA-F]{6}$/;
