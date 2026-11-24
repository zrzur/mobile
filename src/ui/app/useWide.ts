import { useWindowDimensions } from "react-native";

/** The width and height from which the tablet layout (rail and side menu always shown) is used */
export const WIDE_MIN_WIDTH = 768;
export const WIDE_MIN_HEIGHT = 500;

/**
 * Tablet layout: 768 px wide and more. It follows the window, so iPad Split
 * View, Slide Over and Stage Manager switch between the phone layout (1/3,
 * 1/2 and the narrow 2/3 panes) and the tablet one as the window changes.
 * A phone turned sideways (Android: no portrait lock there) is wide but
 * short, and keeps the phone layout.
 */
export function isWide(width: number, height: number) {
  return width >= WIDE_MIN_WIDTH && height >= WIDE_MIN_HEIGHT;
}

export function useWide() {
  const { width, height } = useWindowDimensions();
  return isWide(width, height);
}
