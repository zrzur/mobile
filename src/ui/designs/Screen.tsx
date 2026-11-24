/**
 * The frame every Designs screen shares: the bar, a scrolling page with
 * pull-to-refresh, the dock at the bottom, and the design sheet and report
 * flow any tile can open. On an iPad the page keeps the web's measure
 * (1200 px at most, side padding 3 % of the width between 16 and 40 px).
 */
import { router } from "expo-router";
import { type ReactNode, useCallback, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeProvider";
import { usePullRefresh } from "@/ui/kit";
import { keyboardScrollProps } from "@/ui/kit/keyboard";
import { ReportSheet, type ReportSpec } from "@/ui/profile/ReportFlow";

import type { CommunityItem } from "./api";
import { DesignSheet } from "./DesignSheet";
import { DOCK_ROOM, Dock } from "./Dock";
import { type Chapter, DesignsHeader } from "./Header";
import { useDesignsSession } from "./hooks";
import type { WallActions } from "./Wall";

export type ScreenActions = WallActions & {
  /** report a community design */
  onReport: (item: { id: string; label: string }) => void;
  /** lists that may have changed (a design applied, a favourite saved) */
  version: number;
};

/** Side padding of a Designs page at this window width */
export const pagePadding = (width: number) =>
  Math.round(Math.min(40, Math.max(16, width * 0.03)));

export function DesignsScreen({
  chapter,
  search,
  back,
  dock = true,
  onRefresh,
  onChanged,
  sticky,
  above,
  testID,
  children,
}: {
  chapter?: Chapter;
  search?: { value: string; onChange: (value: string) => void };
  back?: () => void;
  /** the dock at the bottom (not on a design's own page) */
  dock?: boolean;
  onRefresh?: () => Promise<unknown>;
  /** a design was applied or saved in the sheet: lists may have changed */
  onChanged?: () => void;
  /** index of the child that sticks to the top while the page scrolls */
  sticky?: number;
  /** drawn edge to edge before the page's column (a sky, a cover) */
  above?: ReactNode;
  testID?: string;
  children: (actions: ScreenActions) => ReactNode;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  useDesignsSession();
  const [open, setOpen] = useState<CommunityItem | null>(null);
  const [report, setReport] = useState<ReportSpec | null>(null);
  const [version, setVersion] = useState(0);
  const pull = usePullRefresh(async () => {
    await onRefresh?.();
  });

  const onDesign = useCallback(
    (slug: string) =>
      router.push(`/designs/${encodeURIComponent(slug)}` as never),
    [],
  );
  const onMaker = useCallback(
    (id: string) => router.push(`/designs/creator/${id}` as never),
    [],
  );
  const pad = pagePadding(width);
  const actions: ScreenActions = {
    onOpen: setOpen,
    onDesign,
    onMaker,
    version,
    onReport: ({ id, label }) =>
      setReport({ kind: "CommunityItem", id, label }),
  };
  const body = children(actions);

  return (
    <SafeAreaView
      testID={testID}
      style={{ flex: 1, backgroundColor: palette.frame }}
      edges={["top", "left", "right"]}
    >
      <DesignsHeader chapter={chapter} search={search} back={back} />
      <ScrollView
        refreshControl={pull.control}
        onScroll={pull.onScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={
          sticky === undefined ? undefined : [sticky + (above ? 1 : 0)]
        }
        {...keyboardScrollProps}
        contentContainerStyle={{
          paddingBottom: (dock ? DOCK_ROOM : 24) + insets.bottom,
        }}
      >
        {above ? <View>{above}</View> : null}
        {(Array.isArray(body) ? body : [body]).map((part, i) => (
          <View
            key={i}
            style={{
              width: "100%",
              maxWidth: 1200 + 2 * pad,
              alignSelf: "center",
              paddingHorizontal: pad,
              backgroundColor: sticky === i ? palette.frame : undefined,
            }}
          >
            {part}
          </View>
        ))}
      </ScrollView>
      {dock ? <Dock /> : null}
      <DesignSheet
        item={open}
        onClose={() => setOpen(null)}
        onChanged={() => {
          setVersion((v) => v + 1);
          onChanged?.();
        }}
        onReport={(item) => {
          setOpen(null);
          setReport({ kind: "CommunityItem", id: item._id, label: item.name });
        }}
      />
      <ReportSheet spec={report} onClose={() => setReport(null)} />
    </SafeAreaView>
  );
}
