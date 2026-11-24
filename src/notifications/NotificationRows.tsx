/**
 * The notification parts of the server and channel menus (web:
 * ServerContextMenu, shared/NotificationContextMenu, SuppressMentionsMenuItems).
 * A phone sheet has no side sub-menus, so "Mute" and "Notifications" open a
 * page inside the same sheet with a back row: still one modal at a time.
 */
import { useLingui } from "@lingui/react/macro";
import { Pressable, View } from "react-native";

import { clock, shortDate } from "@/chat/time";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { GroupRow, RowGroup } from "@/ui/app/parts";
import { Choices, ControlRow, Toggle } from "@/ui/settings/parts";

import { MUTE_MINUTES, type MuteMinutes, type MuteState, type NotificationState } from "./levels";

export type MenuPage = "main" | "mute" | "level";

/** "Muted until …" under an Unmute row (web: <Time format="datetime">) */
export function useMutedUntil() {
  const { t, i18n } = useLingui();
  return (mute: MuteState | undefined) => {
    if (!mute?.until) return undefined;
    const date = new Date(mute.until);
    const time = `${shortDate(date, i18n.locale)} ${clock(date, i18n.locale)}`;
    return t`Muted until ${time}`;
  };
}

/** A menu row with a second line (GroupRow's look) */
export function DetailRow({
  icon,
  label,
  detail,
  onPress,
  first,
  chevron,
  testID,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
  first?: boolean;
  chevron?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        paddingVertical: 8,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: palette.divider,
        backgroundColor: pressed ? palette.navSelected : "transparent",
      })}
    >
      <View style={{ width: 24, alignItems: "center" }}>
        <Icon name={icon} size={20} color={palette.iconNeutral} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AText size={16} line={22} weight="medium" color={palette.fg} numberOfLines={1}>
          {label}
        </AText>
        {detail ? (
          <AText size={13} line={18} color={palette.muted} numberOfLines={2}>
            {detail}
          </AText>
        ) : null}
      </View>
      {chevron ? <Icon name="caret-right" size={16} color={palette.muted} /> : null}
    </Pressable>
  );
}

/** Back to the menu's first page, with the page's title */
export function PageHead({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 }}>
      <Pressable
        testID="menu-back"
        accessibilityRole="button"
        accessibilityLabel={t`Back`}
        onPress={onBack}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? palette.navHover : "transparent",
        })}
      >
        <Icon name="arrow-left" size={20} color={palette.iconMuted} />
      </Pressable>
      <AText size={16} line={22} weight="semibold" color={palette.header} numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </AText>
    </View>
  );
}

/** "Mute server" / "Mute channel" lengths (web: ContextMenuSubMenu) */
export function MutePage({ title, onPick, onBack, testID }: { title: string; onPick: (minutes: MuteMinutes) => void; onBack: () => void; testID: string }) {
  const { t } = useLingui();
  const label = (minutes: MuteMinutes) => {
    switch (minutes) {
      case 15:
        return t`For 15 minutes`;
      case 60:
        return t`For 1 hour`;
      case 180:
        return t`For 3 hours`;
      case 480:
        return t`For 8 hours`;
      case 1440:
        return t`For 24 hours`;
      default:
        return t`Until I turn it back on`;
    }
  };
  return (
    <>
      <PageHead title={title} onBack={onBack} />
      <RowGroup>
        {MUTE_MINUTES.map((minutes, i) => (
          <GroupRow
            key={String(minutes)}
            first={i === 0}
            icon={minutes === undefined ? "bell-slash" : "clock"}
            label={label(minutes)}
            testID={`${testID}-${minutes ?? "forever"}`}
            onPress={() => onPick(minutes)}
          />
        ))}
      </RowGroup>
    </>
  );
}

type LevelChoice = "default" | NotificationState;

/**
 * "Notifications": the inherited default (with what it means now), All
 * messages, Mentions only, None; in a server also the two suppress switches.
 */
export function LevelPage({
  own,
  defaultTitle,
  defaultText,
  onChange,
  suppress,
  onBack,
}: {
  own: NotificationState | undefined;
  defaultTitle: string;
  defaultText: string;
  onChange: (state: NotificationState | undefined) => void;
  suppress?: { everyone: boolean; roles: boolean; onChange: (kind: "everyone" | "roles", on: boolean) => void };
  onBack: () => void;
}) {
  const { t } = useLingui();
  return (
    <>
      <PageHead title={t`Notifications`} onBack={onBack} />
      <Choices<LevelChoice>
        value={own ?? "default"}
        onChange={(value) => onChange(value === "default" ? undefined : value)}
        options={[
          { value: "default", title: defaultTitle, text: defaultText },
          { value: "all", title: t`All messages` },
          { value: "mention", title: t`Mentions only` },
          { value: "none", title: t`None` },
        ]}
      />
      {suppress ? (
        <RowGroup>
          <ControlRow
            first
            title={t`Suppress @everyone and @here`}
            control={
              <Toggle
                label={t`Suppress @everyone and @here`}
                value={suppress.everyone}
                onChange={(on) => suppress.onChange("everyone", on)}
                testID="suppress-everyone"
              />
            }
          />
          <ControlRow
            title={t`Suppress role mentions`}
            control={<Toggle label={t`Suppress role mentions`} value={suppress.roles} onChange={(on) => suppress.onChange("roles", on)} testID="suppress-roles" />}
          />
        </RowGroup>
      ) : null}
    </>
  );
}

/** The level's words for the row that opens the level page */
export function useLevelText() {
  const { t } = useLingui();
  return (state: NotificationState) => (state === "all" ? t`All messages` : state === "mention" ? t`Mentions only` : t`None`);
}
