// Zrzur design tokens ("Midnight Pulse", dark by default).
// Source: the Zrzur brand and design-system tokens (same values as the web app). Plain JS so
// tailwind.config.js and the app read the same values.

/** Colours: each has one job */
const colors = {
  // surfaces
  frame: "#0D0E16",
  nav: "#171925",
  bg: "#171925",
  surface: "#1D1F2D",
  raised: "#242638",
  selected: "#303348",
  floating: "#11121C",
  "border-soft": "#303348",
  // text
  heading: "#F7F8FC",
  fg: "#F0F1F8",
  "fg-2": "#A1A5B8",
  muted: "#8C90A6",
  // action, focus, selection: pink-red
  action: {
    DEFAULT: "#E0195F",
    hover: "#C8155A",
    pressed: "#B0124F",
    text: "#FF7AA8",
    tint: "rgba(224, 25, 95, 0.14)",
  },
  // meanings
  mention: "#FF5BA8",
  link: "#64A9FF",
  online: "#55DCC8",
  warning: "#F3B96B",
  error: {
    DEFAULT: "#F27488",
    fill: "#B85867",
    hover: "#A04D5A",
    tint: "rgba(242, 116, 136, 0.12)",
  },
  offline: "#7E8299",
  white: "#FFFFFF",
  ink: "#191B27",
  transparent: "transparent",
};

/** Type scale (px): 40/28/22/18/15/13/12; Arabic gets +2 px line height */
const fontSize = {
  display: [40, 48],
  title: [28, 36],
  heading: [22, 30],
  subheading: [18, 26],
  body: [15, 22],
  small: [13, 18],
  tiny: [12, 16],
};

/** Radii: 6 / 10 / 14 / full */
const radius = { sm: 6, md: 10, lg: 14 };

/** 4 px grid */
const space = (n) => n * 4;

module.exports = { colors, fontSize, radius, space };
