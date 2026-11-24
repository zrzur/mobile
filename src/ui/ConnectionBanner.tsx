import { useLingui } from "@lingui/react/macro";
import { useNetworkState } from "expo-network";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { useConnection } from "@/client/ClientProvider";
import { bannerDelay, bannerKind, type BannerKind, mixHex } from "@/client/connection";
import { useTheme } from "@/theme/ThemeProvider";
import { withPhoneNetwork } from "@/ui/home/network";

import { AText } from "./auth/parts";

/**
 * The slim connection line under the header (web: the phone Titlebar
 * status). Hidden while connected; "Connecting…" shows only after 1.5 s so
 * a quick start does not push the screen down and back up; a lasting
 * problem shows at once with "Reconnect now". When the phone itself says
 * it has no network (expo-network), "Device is offline" shows at once.
 */
export function ConnectionBanner() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const { status, everConnected, configFailed, reconnect } = useConnection();
  const network = useNetworkState();
  const kind = withPhoneNetwork(bannerKind(status, everConnected, configFailed), network);
  // the delayed kind whose wait is over; reset once connected, so the next problem waits again
  const [waited, setWaited] = useState<BannerKind | null>(null);
  if (!kind && waited !== null) setWaited(null);

  useEffect(() => {
    if (!kind || !bannerDelay(kind)) return;
    const timer = setTimeout(() => setWaited(kind), bannerDelay(kind));
    return () => clearTimeout(timer);
  }, [kind]);

  const visible = kind && (!bannerDelay(kind) || waited === kind) ? kind : null;
  if (!visible) return null;

  const text =
    visible === "connecting"
      ? t`Connecting…`
      : visible === "reconnecting"
        ? t`Reconnecting…`
        : visible === "offline"
          ? t`Device is offline`
          : t`Disconnected`;
  const canRetry = visible === "offline" || visible === "disconnected";

  return (
    <View
      testID="connection-banner"
      accessibilityLiveRegion="polite"
      accessibilityRole="summary"
      style={{
        minHeight: 44,
        paddingHorizontal: 12,
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        columnGap: 8,
        backgroundColor: mixHex(palette.idle, palette.frame, 18),
      }}
    >
      <AText size={13} line={18} weight="semibold" color={palette.fg} style={{ textAlign: "center" }}>
        {text}
      </AText>
      {canRetry ? (
        <Pressable
          testID="connection-retry"
          accessibilityRole="button"
          onPress={reconnect}
          hitSlop={4}
          style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: "center" }}
        >
          <AText size={13} line={18} weight="semibold" color={palette.accentText} style={{ textDecorationLine: "underline" }}>
            {t`Reconnect now`}
          </AText>
        </Pressable>
      ) : null}
    </View>
  );
}
