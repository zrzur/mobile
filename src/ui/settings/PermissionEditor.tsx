import { useLingui } from "@lingui/react/macro";
import { Fragment, useMemo } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

import { type ChannelKind, holds, type PermissionVariant, variantGroups } from "./overrides";
import { type PermissionKey, permissionGroups, stateOf, type TriState, withState } from "./permissions";
import { ControlRow, SettingsSection, Toggle } from "./parts";

/** A token colour as a light tint (web: color-mix(… 18%, transparent)) */
const tint = (hex: string, alpha: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${alpha}` : hex);

/** The tints and icon colours of the three states (web OverrideSwitch) */
function useTriTones() {
  const { palette } = useTheme();
  return {
    allow: { fill: tint(palette.online, "2E"), ink: palette.onlineText },
    inherit: { fill: palette.navSelected, ink: palette.fg },
    deny: { fill: tint(palette.danger, "29"), ink: palette.danger },
  } satisfies Record<TriState, { fill: string; ink: string }>;
}

/**
 * Allow / Default (inherit) / Deny: one 3-state control per permission (web
 * OverrideSwitch): segments on the field surface with a strong hairline, the
 * chosen one tinted in its meaning; 44 × 44 segments on a phone.
 */
export function TriControl({ value, onChange, label, disabled, testID }: { value: TriState; onChange: (v: TriState) => void; label: string; disabled?: boolean; testID?: string }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const tones = useTriTones();
  const options: { v: TriState; icon: "x" | "minus" | "check"; label: string }[] = [
    { v: "allow", icon: "check", label: t`Allow` },
    { v: "inherit", icon: "minus", label: t`Default (inherit)` },
    { v: "deny", icon: "x", label: t`Deny` },
  ];
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: "row", flexShrink: 0, borderRadius: 8, borderWidth: 1, borderColor: palette.borderStrong, backgroundColor: palette.field, padding: 2, gap: 2, opacity: disabled ? 0.5 : 1 }}
    >
      {options.map((o) => {
        const on = value === o.v;
        return (
          <Pressable
            key={o.v}
            testID={testID ? `${testID}-${o.v}` : undefined}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on, disabled }}
            aria-checked={on}
            onPress={() => onChange(o.v)}
            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: on ? tones[o.v].fill : pressed ? palette.navHover : "transparent" })}
          >
            <Icon name={o.icon} size={16} color={on ? tones[o.v].ink : palette.iconMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** The legend over a 3-state list: Allow / Default (inherit) / Deny */
export function TriLegend() {
  const { palette } = useTheme();
  const { t } = useLingui();
  const tones = useTriTones();
  const items: { v: TriState; icon: "x" | "minus" | "check"; label: string }[] = [
    { v: "allow", icon: "check", label: t`Allow` },
    { v: "inherit", icon: "minus", label: t`Default (inherit)` },
    { v: "deny", icon: "x", label: t`Deny` },
  ];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 8 }}>
      {items.map((i) => (
        <View key={i.icon} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: tones[i.v].fill, alignItems: "center", justifyContent: "center" }}>
            <Icon name={i.icon} size={14} color={tones[i.v].ink} />
          </View>
          <AText size={13} line={18} color={palette.fg2}>
            {i.label}
          </AText>
        </View>
      ))}
    </View>
  );
}

/**
 * The permission list: toggles (allow only, server Everyone) or the 3-state
 * control (roles and overrides). `variant` picks the server list or the
 * channel / category wording; `held` locks rows you do not hold yourself.
 */
export function PermissionList({
  allow,
  deny,
  tri,
  disabled,
  onChange,
  variant = "server",
  kind,
  held,
}: {
  allow: bigint;
  deny: bigint;
  tri: boolean;
  disabled?: boolean;
  onChange: (allow: bigint, deny: bigint) => void;
  variant?: PermissionVariant;
  kind?: ChannelKind;
  /** your own permission value here: rows you lack are disabled (channel overrides) */
  held?: bigint;
}) {
  const { i18n, t } = useLingui();
  const { palette } = useTheme();
  const voice = !!kind?.voice;
  const forum = !!kind?.forum;
  const groups = useMemo(() => variantGroups(i18n, permissionGroups(i18n), variant, { voice, forum }), [i18n, variant, voice, forum]);
  return (
    <>
      {groups.map((g) => {
        const rows = (
          <RowGroup>
            {g.items
              .filter((p) => tri || p.key !== "Administrator")
              .map((p, i) => {
                const state = stateOf(p.key as PermissionKey, allow, deny);
                const locked = disabled || (held !== undefined && !holds(held, p.key));
                return (
                  <View key={p.key} testID={`perm-${p.key}`}>
                    <ControlRow
                      first={i === 0}
                      title={p.title}
                      description={p.text}
                      control={
                        tri ? (
                          <TriControl testID={`perm-${p.key}-control`} label={p.title} value={state} disabled={locked} onChange={(v) => onChange(...withState(p.key, v, allow, deny))} />
                        ) : (
                          <Toggle label={p.title} value={state === "allow"} disabled={locked} onChange={(on) => onChange(...withState(p.key, on ? "allow" : "inherit", allow, deny))} />
                        )
                      }
                    />
                    {p.powerful && state === "allow" ? (
                      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12, marginTop: -4, alignItems: "center" }}>
                        <Icon name="warning" size={16} color={palette.warningText} />
                        <AText size={13} line={18} color={palette.warningText} style={{ flex: 1 }}>
                          {t`Powerful: give it only to people you trust.`}
                        </AText>
                      </View>
                    ) : null}
                  </View>
                );
              })}
          </RowGroup>
        );
        // the first channel group has no heading (web: Admin)
        return g.title ? (
          <SettingsSection key={g.title} title={g.title}>
            {rows}
          </SettingsSection>
        ) : (
          <Fragment key="first">{rows}</Fragment>
        );
      })}
    </>
  );
}
