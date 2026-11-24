/**
 * The web app's tokens as they resolve on a phone (≤600 px), default theme,
 * accent #E0195F. Source: web `packages/client/components/ui` on beta.
 */
export type Palette = {
  dark: boolean;
  frame: string;
  field: string;
  floating: string;
  fg: string;
  header: string;
  fg2: string;
  muted: string;
  iconMuted: string;
  accent: string;
  accentHover: string;
  accentPressed: string;
  onAccent: string;
  accentText: string;
  focus: string;
  link: string;
  danger: string;
  navHover: string;
  navSelected: string;
  outlineBorder: string;
  fieldBorder: string;
  fieldBorderHover: string;
  borderStrong: string;
  borderSoft: string;
  popoverBorder: string;
  online: string;
  /** online / success as text (the dot colour is too pale on light surfaces) */
  onlineText: string;
  /** warning / owner labels as text (idle is the dot colour) */
  warningText: string;
  /** destructive filled buttons (white text) */
  dangerFill: string;
  dangerFillPressed: string;
  tonal: string;
  tonalHover: string;
  tonalBorder: string;
  scrim: string;
  mark: string;
  // signed-in app (web phone tokens)
  barFill: string;
  pill: string;
  mentionBadge: string;
  mentionBg: string;
  mentionBar: string;
  unread: string;
  borderSubtle: string;
  divider: string;
  iconNeutral: string;
  iconHover: string;
  idle: string;
  busy: string;
  focusPresence: string;
  offline: string;
  sheetScrim: string;
  /** the Toggle knob and other white marks on fills */
  knob: string;
  /** drop shadows of floating bars and cards */
  shadow: string;
  /**
   * Over pictures and video (the same in both themes, the picture decides
   * the backdrop): chips and buttons on video, the banner shade, white text.
   */
  overlayScrim: string;
  overlayScrimPressed: string;
  /** a light shade over a banner or a picture tile so white text reads */
  overlayShade: string;
  /** a stronger shade over a picture tile behind its label */
  overlayShadeStrong: string;
  /** a very light shade (a tile that already carries its own picture) */
  overlayShadeFaint: string;
  /** text and icons on an overlay */
  onOverlay: string;
  /** the soft shadow under white text on pictures */
  overlayTextShadow: string;
  /** a hairline on a coloured (user-themed) card */
  onOverlayDivider: string;
};

const OVERLAY = {
  overlayScrim: "rgba(6,8,12,0.6)",
  overlayScrimPressed: "rgba(6,8,12,0.8)",
  overlayShade: "rgba(13,14,22,0.35)",
  overlayShadeStrong: "rgba(0,0,0,0.45)",
  overlayShadeFaint: "rgba(0,0,0,0.15)",
  onOverlay: "#FFFFFF",
  overlayTextShadow: "rgba(0,0,0,0.75)",
  onOverlayDivider: "rgba(255,255,255,0.25)",
} as const;

export const DARK: Palette = {
  dark: true,
  frame: "#0D0E16",
  field: "#181921",
  floating: "#12131B",
  fg: "#F0F1F8",
  header: "#F7F8FC",
  fg2: "#B5B6BD",
  muted: "#979BB1",
  iconMuted: "#989CB2",
  accent: "#E0195F",
  accentHover: "#C8155A",
  accentPressed: "#B0124F",
  onAccent: "#FFFFFF",
  accentText: "#FF7AA8",
  focus: "#EC3D78",
  link: "#64A9FF",
  danger: "#F27488",
  navHover: "rgba(255,255,255,0.06)",
  navSelected: "#26272F",
  outlineBorder: "rgba(240,241,248,0.16)",
  fieldBorder: "rgba(240,241,248,0.09)",
  fieldBorderHover: "rgba(240,241,248,0.18)",
  borderStrong: "#3B3F58",
  borderSoft: "#303348",
  popoverBorder: "#2E3145",
  online: "#55DCC8",
  onlineText: "#55DCC8",
  warningText: "#F3B96B",
  dangerFill: "#B85867",
  dangerFillPressed: "#A04D5A",
  tonal: "#303348",
  tonalHover: "#3B3F58",
  tonalBorder: "rgba(240,241,248,0.10)",
  scrim: "rgba(6,8,12,0.7)",
  mark: "#FFFFFF",
  barFill: "#1F2028",
  pill: "#34353D",
  mentionBadge: "#C2337A",
  mentionBg: "rgba(255,91,168,0.10)",
  mentionBar: "#FF5BA8",
  unread: "#F7F8FC",
  borderSubtle: "rgba(255,255,255,0.06)",
  divider: "#33364D",
  iconNeutral: "#B3B4BC",
  iconHover: "#E5E6EF",
  idle: "#F3B96B",
  busy: "#F27488",
  focusPresence: "#5B9BFF",
  offline: "#7E8299",
  sheetScrim: "rgba(6,8,12,0.6)",
  knob: "#FFFFFF",
  shadow: "#000000",
  ...OVERLAY,
};

export const LIGHT: Palette = {
  dark: false,
  frame: "#E4E6F0",
  field: "#DADCE6",
  floating: "#E0E2EC",
  fg: "#171925",
  header: "#171925",
  fg2: "#4C4E5A",
  // muted text reaches 4.5:1 on every light surface incl. the field, pill and
  // pressed rows (#5E6379 was 4.34:1 on the field)
  muted: "#50556B",
  iconMuted: "#50556B",
  accent: "#C8155A",
  accentHover: "#B0124F",
  accentPressed: "#9C0F46",
  onAccent: "#FFFFFF",
  accentText: "#B0124F",
  focus: "#E0195F",
  // 5.1:1 on the field (#3F6BA4 was 3.99:1)
  link: "#2F5A8F",
  danger: "#B4233B",
  navHover: "rgba(0,0,0,0.045)",
  navSelected: "#CDCFDA",
  outlineBorder: "rgba(23,25,37,0.16)",
  fieldBorder: "rgba(23,25,37,0.09)",
  fieldBorderHover: "rgba(23,25,37,0.18)",
  borderStrong: "rgba(28,23,36,0.17)",
  borderSoft: "#DADCEA",
  popoverBorder: "rgba(23,25,37,0.11)",
  // web light "live": the dot keeps 3:1 on light surfaces; text uses onlineText
  online: "#1C8577",
  onlineText: "#0F6157",
  // 5.2:1 on the field
  warningText: "#765100",
  dangerFill: "#B4233B",
  dangerFillPressed: "#9E1E33",
  tonal: "#E7E8F2",
  tonalHover: "#DADCEA",
  tonalBorder: "rgba(23,25,37,0.10)",
  scrim: "rgba(6,8,12,0.7)",
  mark: "#191B27",
  barFill: "#D8DAE4",
  pill: "#C9CBD6",
  mentionBadge: "#B03C73",
  mentionBg: "rgba(176,60,115,0.10)",
  mentionBar: "#B03C73",
  unread: "#171925",
  borderSubtle: "rgba(0,0,0,0.06)",
  divider: "#CFD1DC",
  iconNeutral: "#4C4E5A",
  iconHover: "#171925",
  idle: "#926400",
  busy: "#B4233B",
  focusPresence: "#2F5A8F",
  offline: "#5E6379",
  sheetScrim: "rgba(6,8,12,0.45)",
  knob: "#FFFFFF",
  shadow: "#000000",
  ...OVERLAY,
};

/** Radius used everywhere in the auth flows (`--z-radius`) */
export const RADIUS = 10;
