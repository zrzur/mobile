/**
 * What the phone itself knows about its network (expo-network), joined
 * with the app's own connection state for the connection line: when the
 * phone says there is no network, the line says "Device is offline" at
 * once instead of a long "Reconnecting…".
 */
import type { BannerKind } from "@/client/connection";

export type PhoneNetwork = { isConnected?: boolean; isInternetReachable?: boolean };

/** The phone reports no network at all (unknown counts as online) */
export function phoneOffline(net: PhoneNetwork | undefined): boolean {
  return net?.isConnected === false || net?.isInternetReachable === false;
}

/** The line's kind with the phone's network taken into account */
export function withPhoneNetwork(kind: BannerKind | null, net: PhoneNetwork | undefined): BannerKind | null {
  if (!kind) return null;
  return phoneOffline(net) ? "offline" : kind;
}
