import { useLingui } from "@lingui/react/macro";
import * as Network from "expo-network";
import { useEffect } from "react";

import { secureStorage } from "@/lib/secureStorage";
import { readPrefs, SAVE_DATA_DEFAULTS, SAVE_DATA_KEY } from "@/ui/settings/user/userPrefs";

import { shouldOfferSaveData } from "./noticeModel";
import { showSnack } from "./snack";

/** Let the app settle before speaking: the offer is never the first thing seen */
const OFFER_DELAY_MS = 6000;
/** Kept on this device: the offer was made (whatever the answer) */
const OFFERED_KEY = "zrzur.prefs.saveDataOffered";

/**
 * Offers Save data once, quietly, when the phone is on mobile data (web:
 * SaveDataOffer, which asks when the device's data saver is on). A short
 * message at the bottom with one button; closing or ignoring it is a "no",
 * and it is never shown again on this phone. Nothing is switched on unless
 * the person presses the button.
 */
export function SaveDataOffer() {
  const { t } = useLingui();

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const [raw, offered, network] = await Promise.all([
          secureStorage.get(SAVE_DATA_KEY).catch(() => null),
          secureStorage.get(OFFERED_KEY).catch(() => null),
          Network.getNetworkStateAsync(),
        ]);
        const prefs = readPrefs(raw, SAVE_DATA_DEFAULTS);
        if (!live || !shouldOfferSaveData({ on: prefs.enabled, offered: offered === "1", networkType: network.type })) return;
        void secureStorage.set(OFFERED_KEY, "1").catch(() => {});
        showSnack({
          message: t`Your device asks to use less data. Turn on Save data?`,
          action: t`Turn on`,
          onAction: () => {
            void secureStorage.set(SAVE_DATA_KEY, JSON.stringify({ ...prefs, enabled: true })).catch(() => {});
            showSnack({ message: t`Save data is on. You can change it in Settings.` });
          },
        });
      } catch {
        // no network information: no offer
      }
    }, OFFER_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // once per app start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
