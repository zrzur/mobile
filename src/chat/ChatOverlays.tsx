import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { ConfirmDialog } from "@/ui/settings/parts";
import { Toast } from "@/ui/settings/user/profile-parts";
import { AttachmentViewer } from "@/ui/viewer/AttachmentViewer";
import { openExternal } from "@/ui/kit/openLink";

import { canTrust, insecure, isOpenable, lookalike, needsConsent, parseUrl, scrutiny } from "./links";
import { closeOverlay, trust, useOverlay, useOverlayHost, useToastText } from "./overlays";

/** A tick row; the whole row is the 44 px target */
export function Tick({ checked, onChange, children, testID }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      onPress={() => onChange(!checked)}
      style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: checked ? palette.accent : palette.muted,
          backgroundColor: checked ? palette.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Icon name="check" size={14} color="#FFFFFF" /> : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

/** "External links can be dangerous!" (web: modals/LinkWarning) */
function LinkWarning({ href, display }: { href: string; display?: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [ok, setOk] = useState(false);
  const url = parseUrl(href);
  if (!url) return null;
  const level = scrutiny(url, display);
  const consent = needsConsent(url, display);
  const offerTrust = canTrust(url, display);
  const warn = (text: React.ReactNode) => (
    <AText size={14} line={20} color={palette.danger}>
      {text}
    </AText>
  );
  return (
    <ConfirmDialog
      visible
      danger={false}
      title={t`External links can be dangerous!`}
      confirm={t`Continue`}
      cancel={t`Close`}
      disabled={!isOpenable(url) || (consent && !ok)}
      onClose={closeOverlay}
      onConfirm={async () => {
        if (ok && offerTrust) trust(url);
        await openExternal(url.toString());
      }}
    >
      <View testID="link-warning" style={{ gap: 4, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: palette.borderSubtle, backgroundColor: palette.field }}>
        <AText size={15} line={20} weight="semibold" color={palette.fg}>
          {url.hostname}
        </AText>
        <AText size={13} line={18} color={palette.muted} numberOfLines={4}>
          {url.toString()}
        </AText>
      </View>
      {insecure(url)
        ? warn(t`This site doesn't use a secure connection (no HTTPS). Others on your network could see or change what you send.`)
        : null}
      {lookalike(url) ? warn(t`This address uses special characters that can imitate another site's name. Check it carefully before you continue.`) : null}
      {level === 1 ? (
        <AText size={14} line={20} color={palette.fg2}>
          {t`You clicked on "${display ?? ""}"`}
        </AText>
      ) : null}
      {level === 2 ? (
        <View style={{ gap: 4 }}>
          {warn(
            <Trans>
              <AText size={14} line={20} weight="bold" color={palette.danger}>
                Be careful!
              </AText>{" "}
              This is not the same as the link that was displayed:
            </Trans>,
          )}
          <AText size={13} line={18} color={palette.danger} numberOfLines={3}>
            {display ?? ""}
          </AText>
        </View>
      ) : null}
      {consent ? (
        <Tick checked={ok} onChange={setOk} testID="link-warning-consent">
          <AText size={14} line={20} color={palette.fg}>
            {t`I understand the consequences`}
          </AText>
        </Tick>
      ) : offerTrust ? (
        <Tick checked={ok} onChange={setOk} testID="link-warning-trust">
          <AText size={14} line={20} color={palette.fg}>
            {t`Don't ask me again for `}
            <AText size={14} line={20} color={palette.link}>
              {url.origin}
            </AText>
          </AText>
        </Tick>
      ) : null}
    </ConfirmDialog>
  );
}

/**
 * Draws the chat's full-screen layer (link warning or attachment viewer).
 * Mount once per screen that shows messages.
 */
export function ChatOverlays() {
  useOverlayHost();
  const overlay = useOverlay();
  if (!overlay) return null;
  if (overlay.kind === "link") return <LinkWarning key={overlay.url} href={overlay.url} display={overlay.display} />;
  return <AttachmentViewer items={overlay.items} index={overlay.index} onClose={closeOverlay} />;
}

/** The chat's short note (web snackbar), see showToast */
export function ChatToast() {
  const text = useToastText();
  return <Toast text={text} testID="chat-toast" />;
}
