import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";
import { View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup, Sheet } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { PressableRow } from "@/ui/kit/Press";

import { call, callStore } from "../call";
import type { OutputRoute } from "../logic";
import { useStore } from "../store";
import { SheetTitle } from "./parts";
import { useVoiceText } from "./text";

export const ROUTE_ICON: Record<OutputRoute, IconName> = {
  speaker: "speaker-high",
  earpiece: "device-mobile",
  headset: "headphones",
  bluetooth: "headset",
};

/** Where the call's sound goes: speaker, phone (earpiece), headphones, Bluetooth */
export function OutputSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const text = useVoiceText();
  const outputs = useStore(callStore, (s) => s.outputs);
  const current = useStore(callStore, (s) => s.output);

  useEffect(() => {
    if (visible) call.refreshOutputs();
  }, [visible]);

  return (
    <Sheet visible={visible} onClose={onClose} testID="output-sheet">
      <SheetTitle>{t`Sound output`}</SheetTitle>
      <View style={{ paddingBottom: 8 }}>
        <RowGroup>
          {outputs.map((route, index) => {
            const selected = route === current;
            return (
              <PressableRow
                key={route}
                highlight={palette.navSelected}
                delay={0}
                lift={false}
                testID={`output-${route}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={text.route(route)}
                onPress={() => {
                  void call.selectOutput(route);
                  onClose();
                }}
                style={{
                  minHeight: 52,
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: palette.divider,
                }}
              >
                <Icon name={ROUTE_ICON[route]} size={22} color={selected ? palette.accentText : palette.iconNeutral} />
                <AText size={16} line={22} weight="medium" color={palette.fg} style={{ flex: 1 }}>
                  {text.route(route)}
                </AText>
                {selected ? <Icon name="check" size={20} color={palette.accentText} /> : null}
              </PressableRow>
            );
          })}
        </RowGroup>
      </View>
    </Sheet>
  );
}
