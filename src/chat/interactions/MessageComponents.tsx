import { useLingui } from "@lingui/react/macro";
import { Image } from "expo-image";
import { memo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText, haptics, Icon, PressScale } from "@/ui/kit";

import { MessageContent } from "../MessageContent";
import { openLink, openViewer } from "../overlays";
import type { MessageBlockProps } from "../slots";
import { useInteractionErrorText } from "./errorText";
import { knownBlocks, type Restriction, restrictionAllows, safeColour, safeUrl } from "./logic";
import { EmojiMark, isSelect, menuOptions, type SelectComponent, SelectSheet } from "./SelectSheet";
import { pressComponent, useInteractionState } from "./store";
import type { ButtonStyle, Component, ComponentBlock, MediaItem } from "./types";

type Context = { channelId: string; messageId: string; serverId?: string; files: { id: string; url?: string; name?: string }[] };

/** Where a media item points: its own web link, or one of the message's files */
function mediaUrl(item: MediaItem, files: Context["files"]): string | undefined {
  if (item.url && safeUrl(item.url)) return item.url;
  if (item.attachment) return files.find((f) => f.id === item.attachment)?.url;
  return undefined;
}

/**
 * Blocks of a bot's message under its text (web: MessageComponents): rows
 * of buttons and menus, text, sections, image galleries, files, separators
 * and cards. On a phone the buttons are 44 px and wrap; a menu opens as a
 * sheet. Using one sends one interaction and shows progress until the bot
 * answers; a failure shows under it in plain words.
 *
 * Registered as a message block (slots.tsx), so MessageRow draws it.
 */
export const MessageComponentsBlock = memo(function MessageComponentsBlock({ message, serverId }: MessageBlockProps) {
  const data = useFields(message, (m) => ({
    blocks: JSON.stringify((m as unknown as { components?: unknown[] }).components ?? []),
    channelId: m.channelId,
    files: (m.attachments ?? []).map((a) => ({ id: a.id, url: a.createFileURL?.() ?? a.originalUrl, name: a.filename })),
  }));
  if (!data || data.blocks === "[]") return null;
  const blocks = knownBlocks(JSON.parse(data.blocks) as unknown[]);
  if (!blocks.length) return null;
  return <Blocks blocks={blocks} context={{ channelId: data.channelId, messageId: message.id, serverId, files: data.files }} />;
});

/** The same blocks for a private answer (it has no files of its own) */
export function ComponentBlocks({ blocks, channelId, messageId, serverId }: { blocks: unknown[] | undefined; channelId: string; messageId: string; serverId?: string }) {
  const list = knownBlocks(blocks);
  if (!list.length) return null;
  return <Blocks blocks={list} context={{ channelId, messageId, serverId, files: [] }} />;
}

function Blocks({ blocks, context }: { blocks: ComponentBlock[]; context: Context }) {
  return (
    <View testID="message-components" style={{ gap: 8, marginTop: 4 }}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} context={context} />
      ))}
    </View>
  );
}

function BlockView({ block, context }: { block: ComponentBlock; context: Context }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  switch (block.type) {
    case "ActionRow":
      return (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {block.components.map((c, i) => (
            <ComponentView key={(c as { custom_id?: string }).custom_id ?? i} component={c} context={context} />
          ))}
        </View>
      );
    case "Text":
      return <MessageContent content={block.content} serverId={context.serverId} />;
    case "Section": {
      const thumb = block.thumbnail ? mediaUrl(block.thumbnail, context.files) : undefined;
      return (
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            {block.text.map((p, i) => (
              <MessageContent key={i} content={p} serverId={context.serverId} />
            ))}
            {block.button ? (
              <View style={{ flexDirection: "row" }}>
                <ComponentView component={block.button} context={context} />
              </View>
            ) : null}
          </View>
          {thumb ? (
            <Image source={{ uri: thumb }} style={{ width: 72, height: 72, borderRadius: 8 }} contentFit="cover" blurRadius={block.thumbnail?.spoiler ? 28 : 0} accessibilityLabel={block.thumbnail?.description ?? t`Image`} />
          ) : null}
        </View>
      );
    }
    case "Gallery": {
      const items = block.items.map((item) => ({ item, url: mediaUrl(item, context.files) }));
      const viewer = items.flatMap(({ url }, i) => (url ? [{ id: `${context.messageId}-g${i}`, url, kind: "image" as const }] : []));
      return (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, maxWidth: 360 }}>
          {items.map(({ item, url }, i) =>
            url ? (
              <Pressable
                key={i}
                accessibilityRole="imagebutton"
                accessibilityLabel={item.description ?? t`Image`}
                onPress={() => openViewer(viewer, viewer.findIndex((v) => v.url === url))}
                style={{ width: items.length === 1 ? 280 : 136, height: items.length === 1 ? 200 : 136, borderRadius: 8, overflow: "hidden", backgroundColor: palette.field }}
              >
                <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} contentFit="cover" blurRadius={item.spoiler ? 28 : 0} />
                {item.spoiler ? (
                  <View style={{ position: "absolute", bottom: 6, start: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: palette.overlayShadeStrong }}>
                    <AText size={11} line={14} weight="bold" color={palette.onOverlay}>
                      {t`Spoiler`}
                    </AText>
                  </View>
                ) : null}
              </Pressable>
            ) : (
              <View key={i} style={{ width: 136, height: 136, borderRadius: 8, backgroundColor: palette.field, alignItems: "center", justifyContent: "center", padding: 8 }}>
                <AText size={12} line={16} color={palette.muted} style={{ textAlign: "center" }}>
                  {t`Image not available`}
                </AText>
              </View>
            ),
          )}
        </View>
      );
    }
    case "File": {
      const file = context.files.find((f) => f.id === block.attachment);
      if (!file?.url) return null;
      return (
        <Pressable
          accessibilityRole="link"
          onPress={() => openLink(file.url!)}
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: palette.field, alignSelf: "flex-start", maxWidth: "100%" }}
        >
          <Icon name="file" size={20} color={palette.iconNeutral} />
          <AText autoDir size={14} line={18} weight="medium" color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
            {file.name ?? ""}
          </AText>
        </Pressable>
      );
    }
    case "Separator":
      return <View style={{ marginVertical: block.spacing === "Large" ? 8 : 2, height: block.divider === false ? 0 : 1, backgroundColor: palette.divider }} />;
    case "Container": {
      const accent = safeColour(block.accent ?? undefined);
      return (
        <View style={{ padding: 12, borderRadius: 10, backgroundColor: palette.field, borderStartWidth: accent ? 4 : 0, borderStartColor: accent, gap: 8 }}>
          {knownBlocks(block.components).map((inner, i) => (
            <BlockView key={i} block={inner} context={context} />
          ))}
        </View>
      );
    }
    default:
      return null;
  }
}

/** Colours of a bot's button by style (web: ActionButton tones) */
function tone(palette: ReturnType<typeof useTheme>["palette"], style: Exclude<ButtonStyle, "Link">) {
  switch (style) {
    case "Primary":
      return { bg: palette.accent, fg: palette.onAccent };
    case "Success":
      return { bg: palette.online, fg: palette.onAccent };
    case "Danger":
      return { bg: palette.dangerFill, fg: palette.onAccent };
    default:
      return { bg: palette.tonal, fg: palette.fg };
  }
}

function ComponentView({ component, context }: { component: Component; context: Context }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const errorText = useInteractionErrorText();
  const customId = (component as { custom_id?: string }).custom_id;
  const key = customId ? `${context.messageId}:${customId}` : "";
  const busy = useInteractionState((s) => (key ? !!s.busy[key] : false));
  const failure = useInteractionState((s) => (key ? s.componentErrors[key] : undefined));
  const roles = useFields(context.serverId ? client.serverMembers.getByKey({ server: context.serverId, user: client.user?.id ?? "" }) : undefined, (m) => m.roles ?? []);
  const allowed = restrictionAllows((component as { restrict?: Restriction }).restrict, client.user?.id, roles ?? []);
  const [open, setOpen] = useState(false);

  const use = (values?: string[]) => {
    if (!customId) return;
    haptics.light();
    pressComponent(client, context.channelId, context.messageId, customId, values).catch(() => {
      // the failure shows under this component (componentErrors)
    });
  };

  let control = null;
  if (component.type === "Button") {
    const label = component.label?.trim();
    const square = !label?.replace(/[\s​]/g, "");
    if (component.style === "Link") {
      const url = component.url ? safeUrl(component.url) : undefined;
      control = (
        <PressScale
          accessibilityRole="link"
          accessibilityLabel={label}
          disabled={!url || component.disabled}
          onPress={() => url && openLink(url)}
          style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: palette.tonal, opacity: component.disabled ? 0.5 : 1 }}
        >
          {component.emoji ? <EmojiMark emoji={component.emoji} /> : null}
          {label ? (
            <AText size={14} line={20} weight="semibold" color={palette.fg} numberOfLines={1}>
              {label}
            </AText>
          ) : null}
          <Icon name="arrow-square-out" size={16} color={palette.iconMuted} />
        </PressScale>
      );
    } else {
      const c = tone(palette, component.style);
      const off = component.disabled || busy || !allowed;
      control = (
        <PressScale
          testID={customId ? `component-${customId}` : undefined}
          accessibilityRole="button"
          accessibilityLabel={label || component.emoji || undefined}
          accessibilityState={{ disabled: off, busy }}
          accessibilityHint={allowed ? undefined : t`Only some people can use this.`}
          disabled={off}
          onPress={() => use()}
          style={{
            minHeight: 44,
            minWidth: 44,
            width: square ? 44 : undefined,
            paddingHorizontal: square ? 0 : 12,
            borderRadius: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            backgroundColor: c.bg,
            opacity: component.disabled || !allowed ? 0.5 : 1,
          }}
        >
          {component.emoji ? <EmojiMark emoji={component.emoji} /> : null}
          {label ? (
            <AText size={14} line={20} weight="semibold" color={c.fg} numberOfLines={1}>
              {label}
            </AText>
          ) : null}
          {busy ? <ActivityIndicator size="small" color={c.fg} /> : null}
        </PressScale>
      );
    }
  } else if (isSelect(component)) {
    const select = component as SelectComponent;
    const options = menuOptions(client, select, context.serverId);
    const max = Math.max(1, select.max_values ?? 1);
    const min = select.min_values ?? 1;
    const defaults = select.type === "StringSelect" ? select.options.filter((o) => o.default).map((o) => o.value) : (select.default_values ?? []);
    const chosen = options.filter((o) => defaults.includes(o.value)).map((o) => o.label);
    const off = select.disabled || busy || !allowed;
    control = (
      <View style={{ flexBasis: "100%" }}>
        <Pressable
          testID={`component-select-${select.custom_id}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: off, busy, expanded: open }}
          disabled={off}
          onPress={() => setOpen(true)}
          style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: palette.fieldBorder, backgroundColor: palette.field, flexDirection: "row", alignItems: "center", gap: 8, opacity: select.disabled || !allowed ? 0.5 : 1 }}
        >
          <AText autoDir size={15} line={20} color={chosen.length ? palette.fg : palette.muted} numberOfLines={1} style={{ flex: 1 }}>
            {chosen.length ? chosen.join(", ") : (select.placeholder ?? t`Make a selection`)}
          </AText>
          {busy ? <ActivityIndicator size="small" color={palette.muted} /> : <Icon name="caret-down" size={16} color={palette.iconMuted} />}
        </Pressable>
        <SelectSheet
          visible={open}
          title={select.placeholder ?? t`Make a selection`}
          options={options}
          selected={defaults}
          min={min}
          max={max}
          onClose={() => setOpen(false)}
          onSubmit={(values) => {
            setOpen(false);
            use(values);
          }}
          testID="component-select-sheet"
        />
      </View>
    );
  }
  if (!control) return null;
  return (
    <>
      {control}
      {failure ? (
        <View accessibilityRole="alert" style={{ flexBasis: "100%", flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name="warning-circle" size={14} color={palette.danger} />
          <AText size={13} line={18} color={palette.danger} style={{ flex: 1 }}>
            {errorText(failure)}
          </AText>
        </View>
      ) : null}
    </>
  );
}
