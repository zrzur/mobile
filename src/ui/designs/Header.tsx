/**
 * The bar every Designs screen opens on (web designs/Stage.tsx at phone
 * width): the way back, the name and the search icon on the top line; the
 * search field under it when opened; the chapters as a row of named chips
 * (owner, 2026-11-17: the top line was crowded and its icons hard to reach).
 * Creator Studio stays on the web: it is a desktop workplace.
 */
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import {
  AText,
  ChromeScale,
  HeaderButton,
  Icon,
  type IconName,
  PressScale,
  SearchField,
} from "@/ui/kit";

export type Chapter = "gallery" | "creators" | "favourites";

const CHAPTER_PATH: Record<Chapter, string> = {
  gallery: "/designs",
  creators: "/designs/creators",
  favourites: "/designs/favourites",
};

/** Leave Designs: back where you came from, or Home */
export function leaveDesigns() {
  if (router.canGoBack()) router.back();
  else router.replace("/home");
}

export function DesignsHeader({
  chapter,
  search,
  back,
}: {
  chapter?: Chapter;
  search?: { value: string; onChange: (value: string) => void };
  back?: () => void;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const chapters: {
    id: Chapter;
    icon: IconName;
    label: string;
    hint: string;
  }[] = [
    {
      id: "gallery",
      icon: "compass",
      label: t`Gallery`,
      hint: t`Find a look you like`,
    },
    {
      id: "creators",
      icon: "paint-brush",
      label: t`Creators`,
      hint: t`The people who make them`,
    },
    {
      id: "favourites",
      icon: "heart",
      label: t`Favourites`,
      hint: t`Designs you saved`,
    },
  ];
  return (
    <ChromeScale>
      <View
        style={{
          backgroundColor: palette.frame,
          borderBottomWidth: 1,
          borderBottomColor: palette.borderSubtle,
        }}
      >
        <View
          style={{
            minHeight: 52,
            paddingTop: 8,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <View style={{ marginStart: -4 }}>
            <HeaderButton
              icon="arrow-left"
              label={back ? t`Back` : t`Leave designs`}
              testID="designs-back"
              onPress={back ?? leaveDesigns}
            />
          </View>
          <AText
            size={16}
            line={24}
            weight="bold"
            color={palette.header}
            numberOfLines={1}
            style={{ flex: 1 }}
            accessibilityRole="header"
          >
            {t`Designs`}
          </AText>
          {search ? (
            <HeaderButton
              icon={open ? "x" : "magnifying-glass"}
              label={t`Search designs`}
              testID="designs-search-toggle"
              onPress={() => {
                if (open && search.value) search.onChange("");
                setOpen(!open);
              }}
            />
          ) : null}
        </View>
        {search && open ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <SearchField
              value={search.value}
              onChange={search.onChange}
              placeholder={t`Search designs`}
              testID="designs-search"
              autoFocus
            />
          </View>
        ) : null}
        {chapter ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 2,
              paddingBottom: 6,
              gap: 8,
            }}
            accessibilityRole="tablist"
            accessibilityLabel={t`Designs`}
          >
            {chapters.map((c) => {
              const on = c.id === chapter;
              return (
                <PressScale
                  key={c.id}
                  testID={`designs-chapter-${c.id}`}
                  accessibilityRole="tab"
                  accessibilityLabel={c.label}
                  accessibilityHint={c.hint}
                  accessibilityState={{ selected: on }}
                  aria-selected={on}
                  haptic={on ? undefined : "selection"}
                  onPress={() =>
                    !on && router.replace(CHAPTER_PATH[c.id] as never)
                  }
                  style={{ minHeight: 44, justifyContent: "center" }}
                >
                  <View
                    style={{
                      height: 36,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingStart: 12,
                      paddingEnd: 14,
                      borderRadius: 18,
                      backgroundColor: on ? palette.navSelected : palette.field,
                    }}
                  >
                    <Icon
                      name={c.icon}
                      size={20}
                      color={on ? palette.fg : palette.fg2}
                    />
                    <AText
                      size={14}
                      line={20}
                      weight="semibold"
                      color={on ? palette.fg : palette.fg2}
                    >
                      {c.label}
                    </AText>
                  </View>
                </PressScale>
              );
            })}
          </ScrollView>
        ) : null}
      </View>
    </ChromeScale>
  );
}
