/**
 * The one full-screen layer the chat may show at a time (link warning,
 * attachment viewer). Rows deep in the list ask for it through these
 * functions; a host component (`ChatOverlays`) draws it. Keeping it out of
 * React context means a request never re-renders the message list.
 */
import { msg } from "@lingui/core/macro";
import { router } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";
import { Alert } from "react-native";

import { i18n } from "@/i18n/i18n";
import { openExternal } from "@/ui/kit/openLink";

import { cleanOrigins, isOpenable, isOwnHost, parseOwnPath, parseUrl } from "./links";
import { jsonFile } from "./persist";

export type ViewerItem = {
  id: string;
  url: string;
  name?: string;
  kind: "image" | "video" | "audio" | "file";
  width?: number;
  height?: number;
  size?: string;
};

export type Overlay =
  | { kind: "link"; url: string; display?: string }
  | { kind: "viewer"; items: ViewerItem[]; index: number }
  | null;

let current: Overlay = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function showOverlay(next: Overlay) {
  current = next;
  emit();
}

export const closeOverlay = () => showOverlay(null);

/** How many hosts (ChatOverlays) are on screen */
let hosts = 0;

/** Called by ChatOverlays while it is mounted */
export function useOverlayHost() {
  useEffect(() => {
    hosts++;
    return () => {
      hosts--;
      if (!hosts) current = null;
    };
  }, []);
}

export function useOverlay(): Overlay {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}

/* ---------- trusted sites (web: stores/LinkSafety) ---------- */

const trustFile = jsonFile("zrzur-trusted-links.json", cleanOrigins);
let trusted: string[] = [];
let trustLoaded = false;

function loadTrusted() {
  if (trustLoaded) return;
  trustLoaded = true;
  void trustFile.read().then((list) => {
    trusted = [...new Set([...list, ...trusted])];
  });
}

export function isTrusted(url: URL) {
  loadTrusted();
  return url.origin !== "null" && trusted.includes(url.origin);
}

export function trust(url: URL) {
  if (url.origin === "null" || trusted.includes(url.origin)) return;
  trusted = [...trusted, url.origin];
  trustFile.write(trusted, 0);
}

/* ---------- opening links ---------- */

/** Open a link from a message: own links in the app, others after the warning */
export function openLink(href: string, display?: string) {
  const url = parseUrl(href);
  if (!url || !isOpenable(url)) return;
  if (isOwnHost(url.hostname)) {
    const own = parseOwnPath(url.pathname);
    if (own.kind === "channel") {
      router.push({ pathname: "/channel/[id]", params: own.messageId ? { id: own.channelId, message: own.messageId } : { id: own.channelId } });
      return;
    }
    if (own.kind === "server") {
      router.push({ pathname: "/server/[id]", params: { id: own.serverId } });
      return;
    }
    void openExternal(url.toString());
    return;
  }
  if (isTrusted(url)) {
    void openExternal(url.toString());
    return;
  }
  if (hosts > 0) {
    showOverlay({ kind: "link", url: url.toString(), display });
    return;
  }
  // a screen without the chat's layer: the phone's own dialog still asks first
  Alert.alert(i18n._(msg`External links can be dangerous!`), url.toString(), [
    { text: i18n._(msg`Close`), style: "cancel" },
    { text: i18n._(msg`Continue`), onPress: () => void openExternal(url.toString()) },
  ]);
}

/** Open an attachment in the full-screen viewer */
export function openViewer(items: ViewerItem[], index: number) {
  const item = items[index];
  if (!item) return;
  if (hosts > 0) showOverlay({ kind: "viewer", items, index });
  else void openExternal(item.url);
}

/* ---------- short notes (web snackbar) ---------- */

let toast: string | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const toastListeners = new Set<() => void>();

/** Show a short note at the bottom of the chat for 3.2 s (also after going back to it) */
export function showToast(text: string) {
  toast = text;
  toastListeners.forEach((fn) => fn());
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast = null;
    toastListeners.forEach((fn) => fn());
  }, 3200);
}

export function useToastText(): string | null {
  return useSyncExternalStore(
    (fn) => {
      toastListeners.add(fn);
      return () => toastListeners.delete(fn);
    },
    () => toast,
  );
}
