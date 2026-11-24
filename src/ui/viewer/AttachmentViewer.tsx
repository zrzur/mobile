import { useLingui } from "@lingui/react/macro";
import { useCallback, useRef, useState } from "react";
import { AccessibilityInfo, FlatList, Modal, Pressable, StatusBar, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ViewerItem } from "@/chat/overlays";
import { DARK } from "@/theme/palette";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";

import { AudioAttachment, VideoPlayer } from "./MediaPlayers";
import { ZoomableImage } from "./ZoomableImage";
import { GestureRoot } from "@/ui/kit/GestureRoot";
import { openExternal } from "@/ui/kit/openLink";
import { copyToClipboard, saveToPhotos, shareFile } from "@/ui/kit/share";
import { useClient } from "@/client/ClientProvider";
import { ReportSheet, type ReportSpec } from "@/ui/profile/ReportFlow";

/** A viewer item from a message: what Report attachment needs (message rows pass it; embeds have none) */
export type MessageViewerItem = ViewerItem & { messageId?: string; authorId?: string; serverId?: string };

/** Always dark, like the web's image viewer: the picture is the light (dark theme tokens) */
const INK = DARK.fg;
const SCRIM = DARK.frame;
const BAR = DARK.scrim;

function BarButton({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? DARK.tonal : "transparent" })}
    >
      <Icon name={icon} size={22} color={INK} />
    </Pressable>
  );
}

function MenuRow({ icon, label, onPress, danger, testID }: { icon: IconName; label: string; onPress: () => void; danger?: boolean; testID?: string }) {
  const ink = danger ? DARK.danger : INK;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: pressed ? DARK.tonal : "transparent" })}
    >
      <Icon name={icon} size={20} color={ink} />
      <AText size={15} line={20} weight="medium" color={ink}>
        {label}
      </AText>
    </Pressable>
  );
}

/**
 * Attachments full screen (web: modals/ImageViewer): swipe between them,
 * pinch or double-tap to zoom pictures, play videos and audio. A tap
 * hides and shows the bars.
 */
export function AttachmentViewer({ items, index, onClose }: { items: ViewerItem[]; index: number; onClose: () => void }) {
  const { t } = useLingui();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(index);
  const [zoomed, setZoomed] = useState(false);
  const [bars, setBars] = useState(true);
  const list = useRef<FlatList<ViewerItem>>(null);
  const item = (items[page] ?? items[0]) as MessageViewerItem | undefined;
  const client = useClient();
  const [more, setMore] = useState(false);
  const [report, setReport] = useState<ReportSpec | null>(null);
  // a file in someone else's message can be reported (web: Report attachment)
  const reportable = !!item?.messageId && item.authorId !== client.user?.id;

  const onTap = useCallback(() => setBars((b) => !b), []);
  // a short note in the bar after Save ("Saved to Photos.")
  const [note, setNote] = useState<string | null>(null);
  const save = async (it: ViewerItem) => {
    const result = await saveToPhotos(it.url, it.name);
    const text = result === "saved" ? t`Saved to Photos.` : result === "failed" ? t`Couldn't save. Try again.` : null;
    if (text) flash(text);
  };
  const flash = (text: string) => {
    setNote(text);
    AccessibilityInfo.announceForAccessibility(text);
    setTimeout(() => setNote(null), 2400);
  };

  const renderItem = useCallback(
    ({ item: it, index: i }: { item: ViewerItem; index: number }) => {
      let body: React.ReactNode;
      if (it.kind === "image") body = <ZoomableImage uri={it.url} width={width} height={height} label={it.name} onZoom={setZoomed} onTap={onTap} />;
      // only the page on screen plays
      else if (it.kind === "video") body = i === page ? <VideoPlayer uri={it.url} width={width} height={height - insets.top - insets.bottom - 112} /> : null;
      else
        body = (
          <View style={{ width: Math.min(420, width - 32) }}>
            {it.kind === "audio" ? (
              <AudioAttachment uri={it.url} name={it.name} size={it.size} />
            ) : (
              <View style={{ alignItems: "center", gap: 12 }}>
                <Icon name="file" size={48} color={INK} />
                <AText size={16} line={22} weight="medium" color={INK} style={{ textAlign: "center" }}>
                  {it.name ?? ""}
                </AText>
              </View>
            )}
          </View>
        );
      return <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>{body}</View>;
    },
    [width, height, page, insets.top, insets.bottom, onTap],
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={["portrait", "portrait-upside-down", "landscape", "landscape-left", "landscape-right"]}>
      <StatusBar barStyle="light-content" />
      <GestureRoot style={{ backgroundColor: SCRIM }}>
        <FlatList
          ref={list}
          testID="viewer-pager"
          data={items}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed && items.length > 1}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(it) => it.id}
          showsHorizontalScrollIndicator={false}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={renderItem}
        />
        {bars ? (
          <View
            style={{ position: "absolute", top: 0, start: 0, end: 0, paddingTop: insets.top + 4, paddingHorizontal: 8, paddingBottom: 4, backgroundColor: BAR, flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <BarButton icon="x" label={t`Close`} onPress={onClose} testID="viewer-close" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AText autoDir size={15} line={20} weight="semibold" color={INK} numberOfLines={1}>
                {item?.name ?? ""}
              </AText>
              {note ? (
                <AText size={12} line={16} color={DARK.onlineText}>
                  {note}
                </AText>
              ) : items.length > 1 ? (
                <AText size={12} line={16} color={DARK.muted}>
                  {`${page + 1} / ${items.length}`}
                </AText>
              ) : null}
            </View>
            {item && (item.kind === "image" || item.kind === "video") ? (
              <BarButton icon="download-simple" label={t`Save to Photos`} onPress={() => void save(item)} testID="viewer-save" />
            ) : null}
            {item ? <BarButton icon="share-network" label={t`Share`} onPress={() => void shareFile(item.url, item.name)} testID="viewer-share" /> : null}
            {item ? <BarButton icon="dots-three" label={t`More`} onPress={() => setMore((m) => !m)} testID="viewer-more" /> : null}
          </View>
        ) : null}
        {bars && more && item ? (
          <View
            testID="viewer-menu"
            style={{ position: "absolute", top: insets.top + 56, end: 8, minWidth: 220, paddingVertical: 4, borderRadius: 14, overflow: "hidden", backgroundColor: DARK.floating, borderWidth: 1, borderColor: DARK.popoverBorder }}
          >
            <MenuRow
              icon="arrow-square-out"
              label={t`Open file`}
              testID="viewer-open"
              onPress={() => {
                setMore(false);
                void openExternal(item.url);
              }}
            />
            <MenuRow
              icon="link"
              label={t`Copy link to file`}
              testID="viewer-copy-link"
              onPress={() => {
                setMore(false);
                void copyToClipboard(item.url);
                flash(t`Copied`);
              }}
            />
            {reportable ? (
              <MenuRow
                icon="flag"
                danger
                label={t`Report attachment`}
                testID="viewer-report"
                onPress={() => {
                  setMore(false);
                  setReport({ kind: "Attachment", id: item.id, messageId: item.messageId, serverId: item.serverId, label: item.name });
                }}
              />
            ) : null}
          </View>
        ) : null}
        <ReportSheet spec={report} onClose={() => setReport(null)} />
      </GestureRoot>
    </Modal>
  );
}
