import {  } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

import { Icon, type IconName } from "../Icon";
import { ChromeScale } from "./fontScale";
import { AText } from "./Text";
import { PressScale } from "./Press";

/**
 * The one chip (web: friends tabs, search filters, forum tags): a 44 px pill,
 * 16 px side padding, 14/600. Selected = raised (nav-selected) with primary
 * text; otherwise the field surface with secondary text. Single-choice groups
 * pass `radio`, toggles pass nothing (button with a selected state).
 */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  radio,
  disabled,
  testID,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  radio?: boolean;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { palette } = useTheme();
  const ink = selected ? palette.fg : palette.fg2;
  return (
    <PressScale
      testID={testID}
      haptic="selection"
      accessibilityRole={radio ? "radio" : "button"}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={radio ? { checked: !!selected, disabled } : { selected: !!selected, disabled }}
      aria-checked={radio ? !!selected : undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: 16,
        borderRadius: 999,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: selected ? palette.navSelected : pressed ? palette.navHover : palette.field,
      })}
    >
      <ChromeScale>
        {icon ? <Icon name={icon} size={16} color={ink} /> : null}
        <AText size={14} line={20} weight="semibold" color={ink} numberOfLines={1}>
          {label}
        </AText>
      </ChromeScale>
    </PressScale>
  );
}
