import { useLingui } from "@lingui/react/macro";
import type { API } from "@zrzur/sdk/solid";
import { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { openExternal } from "@/ui/kit/openLink";
import { SheetModal } from "@/ui/kit/Sheet";
import { AText } from "@/ui/kit/Text";

import { NOTICE_RECHECK_MS, nextNotice, noticeText, safeNoticeLink } from "./noticeModel";
import { showSnack } from "./snack";

type Notice = API.NoticeView;

/**
 * Messages from the Zrzur team (web: NoticeCenter, `/support/notices`). An
 * important one opens at once; others appear as a short message with a
 * Read button. Reading and closing with "Got it" dismisses a notice for
 * good. Looks again every 15 minutes and whenever the app comes back to
 * the front. Failures are silent: the notice waits for the next look.
 * Also tells the server the app's language, so official accounts and
 * notices speak it (web: PUT /support/locale).
 */
export function NoticeCenter() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const told = useRef(new Set<string>());
  const [open, setOpen] = useState<Notice | null>(null);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const locale = i18n.locale;
    if (!locale) return;
    // official accounts are named in the language of the app
    client.setLanguage(locale.split(/[-_]/)[0]);
    (client.api.put("/support/locale" as never, { locale } as never) as Promise<unknown>).catch(() => {
      // tried again next time the app starts
    });
  }, [client, i18n.locale]);

  useEffect(() => {
    let live = true;
    const check = async () => {
      try {
        const notices = (await client.api.get("/support/notices" as never)) as unknown as Notice[];
        if (!live || openRef.current) return;
        const next = nextNotice(notices, told.current);
        if (!next) return;
        told.current.add(next._id);
        if (next.tone === "important") {
          setOpen(next);
          return;
        }
        showSnack({ message: noticeText(next.title, i18n.locale), action: t`Read`, onAction: () => setOpen(next) });
      } catch {
        // offline or signed out
      }
    };
    void check();
    const timer = setInterval(() => void check(), NOTICE_RECHECK_MS);
    const sub = AppState.addEventListener("change", (state) => state === "active" && void check());
    return () => {
      live = false;
      clearInterval(timer);
      sub.remove();
    };
    // the words follow the language at the time of the look
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const dismiss = (notice: Notice) => {
    setOpen(null);
    (client.api.post(`/support/notices/${encodeURIComponent(notice._id)}/dismiss` as never) as Promise<unknown>).catch(() => {
      // shown again next time; nothing is lost
    });
  };

  if (!open) return null;
  const link = safeNoticeLink(open.link);
  return (
    <SheetModal visible onClose={() => setOpen(null)} testID="notice-dialog" panelStyle={{ padding: 16, paddingTop: 24, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Icon name={open.tone === "info" ? "megaphone" : "warning-circle"} size={22} color={open.tone === "info" ? palette.iconNeutral : palette.warningText} />
        <View style={{ flex: 1 }}>
          <AText autoDir size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
            {noticeText(open.title, i18n.locale)}
          </AText>
          <AText size={13} line={18} color={palette.muted}>
            {t`A message from the Zrzur team`}
          </AText>
        </View>
      </View>
      <AText autoDir size={15} line={22} color={palette.fg2} selectable>
        {noticeText(open.body, i18n.locale)}
      </AText>
      <View style={{ gap: 8 }}>
        <Button testID="notice-ok" label={t`Got it`} onPress={() => dismiss(open)} fill />
        {link ? <Button testID="notice-learn-more" label={t`Learn more`} variant="tonal" icon="arrow-square-out" onPress={() => void openExternal(link)} fill /> : null}
      </View>
    </SheetModal>
  );
}
