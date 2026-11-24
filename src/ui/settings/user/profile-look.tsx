import { useLingui } from "@lingui/react/macro";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, type TextStyle, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { SearchField, Sheet } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { SmallButton } from "../parts";
import { HEX, NAME_FONTS, NAME_GRADIENTS, NAME_SOLIDS, THEME_MAIN_DEFAULT, THEME_PRESETS, THEME_SECOND_DEFAULT, decorationArt, isCommunityRef } from "./profile-catalog";
import { useLookLabels } from "./profile-labels";
import { colourKind } from "./profile-logic";
import { TextButton } from "./profile-parts";

/** An avatar with its decoration drawn around it (art 150 % of the avatar) */
export function DecoratedAvatar({ url, name, size, decoration }: { url?: string; name?: string; size: number; decoration?: string }) {
  const art = decoration && !isCommunityRef(decoration) ? decorationArt(decoration) : undefined;
  const outer = Math.round(size * 1.5);
  return (
    <View style={{ width: size, height: size }}>
      <Avatar url={url} name={name} size={size} />
      {art ? (
        <Image
          source={{ uri: art }}
          accessibilityIgnoresInvertColors
          style={{ position: "absolute", width: outer, height: outer, top: (size - outer) / 2, start: (size - outer) / 2 }}
          contentFit="contain"
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
}

/** The text style of a name in a chosen font (nearest system face) */
export function nameFontStyle(font: string | undefined): TextStyle {
  const f = NAME_FONTS.find((x) => x.id === font);
  if (!f || f.id === "default") return {};
  return {
    fontFamily: f.family,
    fontWeight: f.weight,
    fontStyle: f.italic ? "italic" : undefined,
    textTransform: f.upper ? "uppercase" : undefined,
    letterSpacing: f.upper ? f.upper * 16 : undefined,
  };
}

/** A display name in its font and colour; a gradient shows its first colour */
export function StyledName({ text, font, colours, size = 18, forceWhite }: { text: string; font?: string; colours?: string[]; size?: number; forceWhite?: boolean }) {
  const { palette } = useTheme();
  const colour = forceWhite ? "#FFFFFF" : colours?.[0] ?? palette.header;
  return (
    <AText autoDir size={size} line={Math.round(size * 1.35)} weight="bold" color={colour} numberOfLines={1} style={nameFontStyle(font)}>
      {text}
    </AText>
  );
}

export type LookItem = { id: string; label: string; group?: string };

/**
 * The web's look dialogs on a phone (decoration, nameplate, effect): search,
 * a "None" tile, a grid of tiles, then Apply / Cancel.
 */
export function LookPickerSheet({
  title,
  description,
  searchLabel,
  noneLabel,
  emptyText,
  note,
  items,
  groups,
  value,
  tile,
  onApply,
  onClose,
  testID,
}: {
  title: string;
  description?: string;
  searchLabel: string;
  noneLabel: string;
  emptyText: string;
  note?: string;
  items: LookItem[];
  groups?: { id: string; title: string }[];
  value: string | undefined;
  /** the picture of one tile (id undefined = None) */
  tile: (id: string | undefined) => React.ReactNode;
  onApply: (id: string | undefined) => void;
  onClose: () => void;
  testID?: string;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [chosen, setChosen] = useState(value);
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase();
  const shown = q ? items.filter((i) => i.label.toLocaleLowerCase().includes(q)) : items;
  const chosenLabel = chosen ? (items.find((i) => i.id === chosen)?.label ?? chosen) : noneLabel;

  const tileButton = ({ id, label }: { id: string | undefined; label: string }) => {
    const on = chosen === id;
    return (
      <Pressable
        key={id ?? "none"}
        testID={`look-${id ?? "none"}`}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ checked: on }}
        aria-checked={on}
        onPress={() => setChosen(id)}
        style={({ pressed }) => ({
          width: "31%",
          minHeight: 96,
          padding: 8,
          gap: 8,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: on ? palette.accent : "transparent",
          backgroundColor: pressed ? palette.navSelected : palette.field,
        })}
      >
        <View style={{ height: 52, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }}>{tile(id)}</View>
        <AText size={12} line={16} weight="medium" color={palette.fg} numberOfLines={2} style={{ textAlign: "center" }}>
          {label}
        </AText>
        {on ? (
          <View style={{ position: "absolute", top: 4, end: 4 }}>
            <Icon name="check-circle" size={18} color={palette.accentText} />
          </View>
        ) : null}
      </Pressable>
    );
  };

  const grid = (list: LookItem[]) => <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{list.map((i) => tileButton({ id: i.id, label: i.label }))}</View>;

  return (
    <Sheet visible onClose={onClose} testID={testID}>
      <View style={{ gap: 4 }}>
        <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
          {title}
        </AText>
        {description ? (
          <AText size={14} line={20} color={palette.fg2}>
            {description}
          </AText>
        ) : null}
      </View>
      <View style={{ flexDirection: "row" }}>
        <SearchField value={query} onChange={setQuery} placeholder={searchLabel} testID={testID ? `${testID}-search` : undefined} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AText size={13} line={18} weight="semibold" color={palette.fg2}>
          {t`Selected`}
        </AText>
        <AText size={13} line={18} color={palette.fg} style={{ flex: 1 }} numberOfLines={1}>
          {chosenLabel}
        </AText>
      </View>
      {!q ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{tileButton({ id: undefined, label: noneLabel })}</View> : null}
      {shown.length === 0 ? (
        <AText size={14} line={20} color={palette.muted} style={{ textAlign: "center", paddingVertical: 24 }}>
          {emptyText}
        </AText>
      ) : groups ? (
        groups.map((g) => {
          const list = shown.filter((i) => i.group === g.id);
          if (!list.length) return null;
          return (
            <View key={g.id} style={{ gap: 8 }}>
              <AText size={13} line={18} weight="semibold" color={palette.fg2}>
                {g.title}
              </AText>
              {grid(list)}
            </View>
          );
        })
      ) : (
        grid(shown)
      )}
      {note ? (
        <AText size={13} line={18} color={palette.muted}>
          {note}
        </AText>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        <TextButton label={t`Cancel`} onPress={onClose} />
        <SmallButton primary label={t`Apply`} disabled={chosen === value} onPress={() => onApply(chosen)} testID={testID ? `${testID}-apply` : undefined} />
      </View>
    </Sheet>
  );
}

function Swatch({ colours, on, onPress, label }: { colours: string[]; on: boolean; onPress: () => void; label: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      aria-checked={on}
      onPress={onPress}
      hitSlop={4}
      style={{ width: 44, height: 44, borderRadius: 22, padding: 2, borderWidth: 2, borderColor: on ? palette.accent : "transparent" }}
    >
      <View style={{ flex: 1, borderRadius: 18, overflow: "hidden", flexDirection: "row" }}>
        {colours.map((c, i) => (
          <View key={`${c}-${i}`} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </View>
    </Pressable>
  );
}

function Chip({ label, on, onPress, icon, testID }: { label: string; on: boolean; onPress: () => void; icon?: IconName; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 999, flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: on ? palette.navSelected : palette.field, borderWidth: 1, borderColor: on ? palette.accent : "transparent" }}
    >
      {icon ? <Icon name={icon} size={16} color={palette.fg2} /> : null}
      <AText size={14} line={20} weight="semibold" color={on ? palette.fg : palette.fg2}>
        {label}
      </AText>
    </Pressable>
  );
}

/** Dialog "Display name style": font grid, colour mode, swatches */
export function NameStyleSheet({
  name,
  font,
  colours,
  onApply,
  onClose,
}: {
  name: string;
  font: string | undefined;
  colours: string[] | undefined;
  onApply: (font: string | undefined, colours: string[] | undefined) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const labels = useLookLabels();
  const [f, setF] = useState(font ?? "default");
  const [c, setC] = useState<string[]>(colours ?? []);
  const mode = colourKind(c);
  const unchanged = f === (font ?? "default") && JSON.stringify(c) === JSON.stringify(colours ?? []);
  const sample = i18n.locale === "ar" ? "زر" : "Gg";

  const surprise = () => {
    const nextFont = NAME_FONTS[Math.floor(Math.random() * NAME_FONTS.length)].id;
    const gradient = Math.random() < 0.5;
    setF(nextFont);
    setC(gradient ? [...NAME_GRADIENTS[Math.floor(Math.random() * NAME_GRADIENTS.length)]] : [NAME_SOLIDS[Math.floor(Math.random() * NAME_SOLIDS.length)]]);
  };

  return (
    <Sheet visible onClose={onClose} testID="name-style-dialog">
      <View style={{ gap: 4 }}>
        <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
          {t`Display name style`}
        </AText>
        <AText size={14} line={20} color={palette.fg2}>
          {t`Pick a font and colour for your display name.`}
        </AText>
      </View>
      <View style={{ padding: 16, borderRadius: 14, backgroundColor: palette.field, alignItems: "center" }}>
        <StyledName text={name} font={f} colours={c} size={20} />
      </View>
      <AText size={13} line={18} weight="semibold" color={palette.fg2}>
        {t`Choose font`}
      </AText>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {NAME_FONTS.map((x) => {
          const on = f === x.id;
          return (
            <Pressable
              key={x.id}
              testID={`font-${x.id}`}
              accessibilityRole="radio"
              accessibilityLabel={labels.font(x.id)}
              accessibilityState={{ checked: on }}
              aria-checked={on}
              onPress={() => setF(x.id)}
              style={{ width: "23%", minHeight: 56, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: on ? palette.navSelected : palette.field, borderWidth: 2, borderColor: on ? palette.accent : "transparent" }}
            >
              <AText size={18} line={24} weight="bold" color={palette.fg} style={nameFontStyle(x.id)}>
                {sample}
              </AText>
              <AText size={11} line={14} color={palette.muted} numberOfLines={1}>
                {labels.font(x.id)}
              </AText>
            </Pressable>
          );
        })}
      </View>
      <AText size={13} line={18} weight="semibold" color={palette.fg2}>
        {t`Choose colour`}
      </AText>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip label={t`None`} on={mode === "none"} onPress={() => setC([])} testID="colour-none" />
        <Chip label={t`Solid`} on={mode === "solid"} onPress={() => setC([c[0] ?? NAME_SOLIDS[0]])} testID="colour-solid" />
        <Chip label={t`Gradient`} on={mode === "gradient"} onPress={() => setC(c.length === 2 ? c : [...NAME_GRADIENTS[0]])} testID="colour-gradient" />
      </View>
      {mode === "solid" ? (
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {NAME_SOLIDS.map((s) => (
            <Swatch key={s} colours={[s]} label={s} on={c[0] === s} onPress={() => setC([s])} />
          ))}
        </View>
      ) : null}
      {mode === "gradient" ? (
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {NAME_GRADIENTS.map((g) => (
            <Swatch key={g.join("")} colours={g} label={g.join(" → ")} on={c[0] === g[0] && c[1] === g[1]} onPress={() => setC([...g])} />
          ))}
        </View>
      ) : null}
      {mode !== "none" ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <HexField label={t`Pick a colour`} value={c[0]} onChange={(v) => setC(mode === "gradient" ? [v, c[1] ?? v] : [v])} />
          </View>
          {mode === "gradient" ? (
            <View style={{ flex: 1 }}>
              <HexField label={t`Second colour`} value={c[1]} onChange={(v) => setC([c[0] ?? v, v])} />
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: "row" }}>
        <TextButton label={t`Surprise me`} icon="sparkle" onPress={surprise} />
      </View>
      <AText size={13} line={18} color={palette.muted}>
        {t`In a server, a role colour wins over yours, but your font stays. On a profile card with a theme, your name turns white so it stays readable.`}
      </AText>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        <TextButton
          label={t`Reset`}
          onPress={() => {
            setF("default");
            setC([]);
          }}
        />
        <SmallButton primary label={t`Apply`} disabled={unchanged} onPress={() => onApply(f === "default" ? undefined : f, c.length ? c : undefined)} testID="name-style-apply" />
      </View>
    </Sheet>
  );
}

/** A #RRGGBB field: keeps what is typed, reports only valid colours */
function HexField({ label, value, onChange }: { label: string; value: string | undefined; onChange: (hex: string) => void }) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? value ?? "";
  return (
    <TextField
      label={label}
      value={shown}
      autoCapitalize="none"
      autoCorrect={false}
      maxLength={7}
      placeholder="#RRGGBB"
      onChangeText={(v) => {
        const next = v.startsWith("#") ? v : `#${v}`;
        setTyped(next);
        if (HEX.test(next)) onChange(next.toLowerCase());
      }}
      onBlur={() => setTyped(null)}
    />
  );
}

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const INK_DARK = "#101114";
const INK_LIGHT = "#FFFFFF";

/**
 * The ink (white or near-black) with the higher WCAG contrast on the middle
 * of the wash, where the name sits (all twelve pairs reach 4.5:1 or more)
 */
function inkOn(colours: [string, string]): string {
  const mid = luminance(midColour(colours[0], colours[1]));
  return contrast(luminance(INK_LIGHT), mid) >= contrast(luminance(INK_DARK), mid) ? INK_LIGHT : INK_DARK;
}

/** The middle of two colours (the flat colour under a wash) */
function midColour(a: string, b: string): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const mix = [16, 8, 0].map((sh) => Math.round((((pa >> sh) & 255) + ((pb >> sh) & 255)) / 2));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** A two-colour wash (the profile theme preview tiles) */
function Wash({ colours, id }: { colours: [string, string]; id: string }) {
  return (
    <Svg style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={`wash-${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colours[0]} />
          <Stop offset="1" stopColor={colours[1]} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#wash-${id})`} />
    </Svg>
  );
}

/**
 * Profile theme (web ProfileTheme): one card with the main and second colour
 * as 44 px squares and None, then the ready-made pairs as a two-column grid
 * of washes. A square opens its #RRGGBB field under the row.
 */
export function ThemeEditor({ value, onChange }: { value: string[] | undefined; onChange: (theme: string[] | undefined) => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const labels = useLookLabels();
  const theme = value ?? [];
  const [editing, setEditing] = useState<0 | 1 | null>(null);
  const square = (i: 0 | 1, label: string) => {
    const colour = theme[i];
    const on = editing === i;
    return (
      <Pressable
        testID={`theme-colour-${i}`}
        accessibilityRole="button"
        accessibilityLabel={colour ? `${label}: ${colour}` : label}
        accessibilityState={{ expanded: on }}
        onPress={() => setEditing(on ? null : i)}
        style={{ width: 44, height: 44, borderRadius: 10, borderWidth: 2, borderColor: on ? palette.accent : palette.borderSoft, backgroundColor: colour ?? "transparent", alignItems: "center", justifyContent: "center" }}
      >
        {colour ? null : <Icon name="plus" size={16} color={palette.muted} />}
      </Pressable>
    );
  };
  return (
    <View style={{ borderRadius: 14, backgroundColor: palette.field, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {square(0, t`Main colour`)}
        {square(1, t`Second colour`)}
        <Button
          variant="ghost"
          size="sm"
          label={t`None`}
          disabled={!theme.length}
          onPress={() => {
            setEditing(null);
            onChange(undefined);
          }}
          testID="theme-none"
        />
      </View>
      {editing !== null ? (
        <HexField
          key={editing}
          label={editing === 0 ? t`Main colour` : t`Second colour`}
          value={theme[editing] ?? (editing === 0 ? THEME_MAIN_DEFAULT : THEME_SECOND_DEFAULT)}
          onChange={(v) => onChange(editing === 0 ? (theme[1] ? [v, theme[1]] : [v]) : [theme[0] ?? THEME_MAIN_DEFAULT, v])}
        />
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {THEME_PRESETS.map((p) => {
          const on = theme[0] === p.colours[0] && theme[1] === p.colours[1];
          return (
            <Pressable
              key={p.id}
              testID={`theme-${p.id}`}
              accessibilityRole="button"
              accessibilityLabel={labels.theme(p.id)}
              accessibilityState={{ selected: on }}
              aria-pressed={on}
              onPress={() => onChange([...p.colours])}
              style={({ pressed }) => ({
                flexBasis: "40%",
                flexGrow: 1,
                minHeight: 44,
                borderRadius: 8,
                overflow: "hidden",
                justifyContent: "flex-end",
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderWidth: 2,
                borderColor: on ? palette.accent : "transparent",
                // the flat middle colour under the wash (what the ink is measured against)
                backgroundColor: midColour(p.colours[0], p.colours[1]),
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Wash colours={p.colours} id={p.id} />
              <AText size={12} line={16} weight="semibold" color={inkOn(p.colours)} numberOfLines={1}>
                {labels.theme(p.id)}
              </AText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
