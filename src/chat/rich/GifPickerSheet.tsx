import { useLingui } from "@lingui/react/macro";
import { Image } from "expo-image";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, type ScrollViewInstance, useWindowDimensions, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { SearchField } from "@/ui/app/parts";
import { Button } from "@/ui/kit";
import { Icon, type IconName } from "@/ui/Icon";

import {
  GIF_URL,
  type KlipyCategory,
  type KlipyGif,
  type KlipyPage,
  balanceColumns,
  gifLocale,
  klipyCategories,
  klipyGifs,
  mediaSrc,
  mergePages,
  previewOf,
  sendUrlOf,
  stillOf,
} from "./gifs";
import { RText, RichSheet, withAlpha } from "./parts";

type Results = { key: string; pages: KlipyPage[]; error?: boolean };
type Categories = { key: string; list: KlipyCategory[]; cover?: string; error?: boolean };

/** Our session token, only to prove to our own GIF service who asks (never forwarded) */
function useGifToken() {
  const client = useClient();
  try {
    const [name, value] = client.authenticationHeader;
    return name.toLowerCase() === "x-session-token" ? value : undefined;
  } catch {
    return undefined;
  }
}

function PickerState({ icon, title, children, action }: { icon: IconName; title: string; children: string; action?: { label: string; onPress: () => void } }) {
  const { palette } = useTheme();
  return (
    <View accessibilityRole="text" accessibilityLiveRegion="polite" style={{ minHeight: 140, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 16, paddingHorizontal: 16 }}>
      <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: palette.field, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={30} color={palette.muted} />
      </View>
      <RText size={16} line={22} weight="bold" color={palette.fg} style={{ textAlign: "center" }}>
        {title}
      </RText>
      <RText size={13} line={20} color={palette.muted} style={{ textAlign: "center", maxWidth: 290 }}>
        {children}
      </RText>
      {action ? (
        <View style={{ marginTop: 4 }}>
          <Button label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

function CategoryTile({ label, image, width, trending, onPress }: { label: ReactNode; image?: string; width: number; trending?: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  const [failed, setFailed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        height: width / 2,
        borderRadius: 8,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: pressed ? palette.accent : "transparent",
        backgroundColor: trending ? withAlpha(palette.accent, 0.55) : palette.field,
        alignItems: "center",
        justifyContent: "center",
        padding: 8,
      })}
    >
      {image && !failed ? (
        <Image
          source={{ uri: image }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={image}
          onError={() => setFailed(true)}
        />
      ) : null}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: trending && !image ? palette.overlayShadeFaint : palette.overlayShadeStrong }} />
      <RText size={14} line={20} weight="bold" color={palette.onOverlay} style={{ textAlign: "center" }} numberOfLines={2}>
        {label}
      </RText>
    </Pressable>
  );
}

/** A still shows at once; the small animated preview plays unless motion is reduced */
function GifTile({ gif, width, still, onPress }: { gif: KlipyGif; width: number; still: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const [failed, setFailed] = useState(false);
  const media = previewOf(gif);
  const stillSrc = mediaSrc(GIF_URL, stillOf(gif));
  const animated = mediaSrc(GIF_URL, media);
  const src = still ? (stillSrc ?? animated) : (animated ?? stillSrc);
  const height = Math.max(72, Math.round((width * (media?.height ?? 1)) / Math.max(1, media?.width ?? 1)));
  return (
    <Pressable
      testID="gif-tile"
      accessibilityRole="button"
      accessibilityLabel={gif.title || t`Send GIF`}
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        height,
        marginBottom: 8,
        borderRadius: 8,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: pressed ? palette.accent : "transparent",
        backgroundColor: palette.field,
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      {src && !failed ? (
        <Image
          source={{ uri: src }}
          placeholder={!still && stillSrc ? { uri: stillSrc } : undefined}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={String(gif.id)}
          autoplay={!still}
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon name="gif" size={28} color={palette.muted} />
      )}
    </Pressable>
  );
}

/**
 * The GIF picker (web GifPicker) as a phone sheet: category tiles first,
 * then trending or search results in two balanced columns, more while you
 * scroll. All through Zrzur's own GIF service; a press sends the GIF's
 * address through `onSend`, as the web does.
 */
export function GifPickerSheet({ visible, onClose, onSend }: { visible: boolean; onClose: () => void; onSend: (url: string) => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const token = useGifToken();
  const { width: screen } = useWindowDimensions();
  const locale = gifLocale(i18n.locale);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [trending, setTrending] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [categories, setCategories] = useState<Categories>();
  const [results, setResults] = useState<Results>();
  const [reduceMotion, setReduceMotion] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadingMore = useRef(false);
  const scroller = useRef<ScrollViewInstance>(null);

  const browsing = !query && !trending;
  const enabled = !!GIF_URL;
  const catKey = `${locale}|${nonce}`;
  const resKey = `${locale}|${trending ? "" : query}|${nonce}`;

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => alive && setReduceMotion(value));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!visible || !enabled || !browsing) return;
    const controller = new AbortController();
    Promise.all([
      klipyCategories(GIF_URL, locale, token, controller.signal),
      klipyGifs(GIF_URL, { query: "", page: 1, locale }, token, controller.signal).catch(() => undefined),
    ])
      .then(([list, first]) => {
        const top = first?.data?.[0];
        setCategories({ key: catKey, list, cover: top ? mediaSrc(GIF_URL, previewOf(top)) : undefined });
      })
      .catch(() => !controller.signal.aborted && setCategories({ key: catKey, list: [], error: true }));
    return () => controller.abort();
  }, [visible, enabled, browsing, locale, token, catKey]);

  useEffect(() => {
    if (!visible || !enabled || browsing) return;
    const controller = new AbortController();
    klipyGifs(GIF_URL, { query: trending ? "" : query, page: 1, locale }, token, controller.signal)
      .then((page) => setResults({ key: resKey, pages: [page] }))
      .catch(() => !controller.signal.aborted && setResults({ key: resKey, pages: [], error: true }));
    scroller.current?.scrollTo({ y: 0, animated: false });
    return () => controller.abort();
  }, [visible, enabled, browsing, trending, query, locale, token, resKey]);

  const loadMore = () => {
    const last = results?.pages[results.pages.length - 1];
    if (loadingMore.current || !results || results.key !== resKey || !last?.has_next) return;
    loadingMore.current = true;
    const key = results.key;
    klipyGifs(GIF_URL, { query: trending ? "" : query, page: last.current_page + 1, locale }, token)
      .then((page) => setResults((current) => (current && current.key === key ? { ...current, pages: [...current.pages, page] } : current)))
      .catch(() => {})
      .finally(() => {
        loadingMore.current = false;
      });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 240) loadMore();
  };

  const type = (value: string) => {
    setTrending(false);
    setFilter(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setQuery(value.trim()), 300);
  };

  const reset = () => {
    clearTimeout(timer.current);
    setFilter("");
    setQuery("");
    setTrending(false);
  };

  const send = (gif: KlipyGif) => {
    const url = sendUrlOf(gif);
    if (!url) return;
    onSend(url);
    onClose();
  };

  const loading = browsing ? categories?.key !== catKey : results?.key !== resKey;
  const failed = browsing ? !!categories?.error && !loading : !!results?.error && !loading;
  const gifs = !browsing && results?.key === resKey ? mergePages(results.pages) : [];
  const [left, right] = balanceColumns(gifs);
  const column = Math.floor((Math.min(screen, 600) - 16 * 2 - 8) / 2);
  const more = !browsing && !!results?.pages[results.pages.length - 1]?.has_next;

  let body: ReactNode;
  if (!enabled) {
    body = (
      <PickerState icon="gif" title={t`GIFs aren't available yet`}>
        {t`You can still send emoji in the meantime.`}
      </PickerState>
    );
  } else if (loading) {
    body = (
      <View accessibilityRole="progressbar" accessibilityLabel={t`Loading GIFs`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {Array.from({ length: 8 }, (_, i) => (
          <View key={i} style={{ width: column, height: 112, borderRadius: 8, backgroundColor: palette.field }} />
        ))}
      </View>
    );
  } else if (failed) {
    body = (
      <PickerState icon="arrow-clockwise" title={t`Couldn't load GIFs`} action={{ label: t`Try again`, onPress: () => setNonce((n) => n + 1) }}>
        {t`The GIF service couldn't be reached. Please try again.`}
      </PickerState>
    );
  } else if (browsing) {
    body = (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <CategoryTile label={t`Trending GIFs`} image={categories?.cover} width={column} trending onPress={() => setTrending(true)} />
        {(categories?.list ?? []).map((category) => (
          <CategoryTile
            key={category.query}
            label={category.category}
            image={mediaSrc(GIF_URL, { src: category.preview_src })}
            width={column}
            onPress={() => {
              clearTimeout(timer.current);
              setFilter(category.query);
              setQuery(category.query);
            }}
          />
        ))}
      </View>
    );
  } else if (!gifs.length) {
    body = (
      <PickerState icon="magnifying-glass" title={t`No GIFs found`} action={{ label: t`Browse categories`, onPress: reset }}>
        {t`Try a different word or explore the categories.`}
      </PickerState>
    );
  } else {
    body = (
      <>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
          {[left, right].map((list, c) => (
            <View key={c} style={{ width: column }}>
              {list.map((gif) => (
                <GifTile key={String(gif.id)} gif={gif} width={column} still={reduceMotion} onPress={() => send(gif)} />
              ))}
            </View>
          ))}
        </View>
        {more ? <View style={{ height: 112, borderRadius: 8, backgroundColor: palette.field }} /> : null}
      </>
    );
  }

  return (
    <RichSheet visible={visible} onClose={onClose} height={0.72} testID="gif-picker">
      <View accessibilityLabel={t`GIF picker`} style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
          {!browsing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t`Back to categories`}
              onPress={reset}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginStart: -8 }}
            >
              <Icon name="arrow-left" size={18} color={palette.fg2} />
            </Pressable>
          ) : null}
          <SearchField testID="gif-search" value={filter} onChange={type} placeholder={t`Search KLIPY`} />
        </View>
        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={onScroll}
          scrollEventThrottle={100}
        >
          {body}
        </ScrollView>
        {enabled ? (
          <RText size={11} line={16} color={palette.muted} style={{ textAlign: "center", paddingTop: 8 }}>
            Powered by KLIPY
          </RText>
        ) : null}
      </View>
    </RichSheet>
  );
}
