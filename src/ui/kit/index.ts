/**
 * The shared design kit of the phone app: one of each control, matching the
 * web phone look (44 px targets, radius 10, tokens only, 4 px grid, RTL).
 * Area screens import from here instead of drawing their own copies.
 */
export { Button, type ButtonSize, type ButtonVariant } from "./Button";
export { Chip } from "./Chip";
export { AText, ParagraphText } from "./Text";
export { CHROME_MAX_FONT_SCALE, ChromeScale, useFontScaleCap } from "./fontScale";
export { isRTL, mirrorStyle } from "./direction";
export {
  autoDirStyle,
  directionRuns,
  firstStrongDirection,
  inputDirStyle,
  inputSideStyle,
  isLatinInput,
  isolate,
  isolateWithin,
  paragraphDirStyle,
  paragraphSideStyle,
  startsAtLayoutStart,
  textDirection,
  type TextDir,
} from "./bidi";
export { DismissKeyboard, KeyboardFooter, KeyboardSafeScreen, KEYBOARD_OPTIONS, dismissKeyboardResponder, keyboardScrollProps, keyboardShown } from "./keyboard";
export { FIELD_HEIGHT, TextField } from "../auth/parts";
export { CenterNote, CountBadge, GroupRow, HeaderButton, RowGroup, ScreenHeader, SearchField, Sheet, ToolButton } from "../app/parts";
export { Choices, ConfirmDialog, ControlRow, SaveBar, SettingsPage, SettingsSection, SmallButton, Toggle } from "../settings/parts";
export { Icon, type IconName, MIRRORED } from "../Icon";

// interaction foundation (iPhone feel): each file's header documents its use
export { haptics, buzz, type HapticKind, useHapticsSetting, loadHapticsPref } from "./haptics";
export { useReduceMotion, PRESS_SPRING, SHEET_SPRING, FADE_MS } from "./motion";
export { GestureRoot } from "./GestureRoot";
export { PressScale, PressableRow, type PressProps } from "./Press";
export { SheetModal, type SheetProps } from "./Sheet";
export { SwipeRow, type SwipeAction, closeSwipeRows, swipeA11y } from "./SwipeRow";
export { ContextMenu, MENU_DELAY } from "./ContextMenu";
export { Skeleton, SkeletonRows } from "./Skeleton";
export { usePullRefresh } from "./PullRefresh";
export { openExternal, isWebLink, useBrowserTheme } from "./openLink";
export { openLink } from "../../chat/overlays";
export { useScrollToTop, scrollTabToTop } from "./scrollToTop";
export { useLeaveGuard, confirmDiscard } from "./leaveGuard";
export { copyToClipboard, saveToPhotos, shareFile, shareText } from "./share";
export { screenMotion, type ScreenKind } from "../app/transitions";
