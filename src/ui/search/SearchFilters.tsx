import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { GroupRow, RowGroup, SearchField, Sheet } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit";

import { Pill, PillRow, Segmented } from "./parts";
import { anyMatches, searchChannels, searchPeople } from "./people";
import { addFilter, dayValue, removeFilter, removeKey, type SearchScope, type SearchSort } from "./searchChoices";
import { useSearchLabels } from "./searchLabels";
import { HAS_VALUES, type HasValue, parseSearch } from "./searchSyntax";

function Label({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <AText size={13} line={18} weight="semibold" color={palette.fg2} style={{ marginTop: 4 }}>
      {children}
    </AText>
  );
}

/**
 * Phones: the filters of the message search, picked instead of typed (web:
 * SearchFiltersPhone). A choice is written into the search field as the
 * filter one could type (`has:image`), so both ways stay one thing.
 */
export function SearchFilters({
  visible,
  onClose,
  channel,
  query,
  onQuery,
  scope,
  onScope,
  sort,
  onSort,
}: {
  visible: boolean;
  onClose: () => void;
  channel: Channel;
  query: string;
  onQuery: (query: string) => void;
  scope: SearchScope;
  onScope: (scope: SearchScope) => void;
  sort: SearchSort;
  onSort: (sort: SearchSort) => void;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const labels = useSearchLabels();
  /** which list is open inside the sheet */
  const [picking, setPicking] = useState<"from" | "in" | null>(null);
  const [find, setFind] = useState("");

  const tokens = parseSearch(query).tokens;
  const has = (value: HasValue) => tokens.some((token) => token.key === "has" && token.value === value);
  const day = tokens.find((token) => token.key === "during")?.value;
  const inServer = !!channel.server;

  const pick = (key: "from" | "in", value: string) => {
    onQuery(addFilter(query, key, value));
    setPicking(null);
    setFind("");
  };
  const close = () => {
    setPicking(null);
    setFind("");
    onClose();
  };

  let body;
  if (picking) {
    const people = picking === "from" ? searchPeople(channel, client).filter((p) => anyMatches([p.name, p.username], find)).slice(0, 40) : [];
    const channels = picking === "in" ? searchChannels(channel).filter((c) => anyMatches([c.name], find)).slice(0, 40) : [];
    body = (
      <>
        <Pressable
          testID="search-filters-back"
          accessibilityRole="button"
          onPress={() => setPicking(null)}
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <Icon name="arrow-left" size={20} color={palette.fg2} />
          <AText size={16} line={22} weight="semibold" color={palette.header}>
            {picking === "from" ? t`From a member` : t`In a channel`}
          </AText>
        </Pressable>
        <View style={{ flexDirection: "row" }}>
          <SearchField testID="search-filters-find" value={find} onChange={setFind} placeholder={picking === "from" ? t`Find a member` : t`Find a channel`} />
        </View>
        <RowGroup>
          {picking === "from"
            ? people.map((p, i) => (
                <Pressable
                  key={p.id}
                  testID={`search-pick-person-${p.id}`}
                  accessibilityRole="button"
                  onPress={() => pick("from", p.username ?? p.name)}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    paddingHorizontal: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderTopWidth: i ? 1 : 0,
                    borderTopColor: palette.divider,
                    backgroundColor: pressed ? palette.navSelected : "transparent",
                  })}
                >
                  <Avatar url={p.avatar} name={p.name} size={28} />
                  <AText autoDir size={16} line={22} weight="medium" color={palette.fg} numberOfLines={1} style={{ flex: 1 }}>
                    {p.name}
                  </AText>
                </Pressable>
              ))
            : channels.map((c, i) => <GroupRow key={c.id} first={i === 0} testID={`search-pick-channel-${c.id}`} icon="hash" label={c.name ?? ""} onPress={() => pick("in", c.name ?? "")} />)}
        </RowGroup>
      </>
    );
  } else {
    body = (
      <>
        <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
          {t`Filter results`}
        </AText>
        {inServer ? (
          <>
            <Label>{t`Where to search`}</Label>
            <Segmented
              testID="search-scope"
              label={t`Where to search`}
              value={scope}
              onChange={onScope}
              options={[
                { value: "channel", label: t`This channel` },
                { value: "server", label: t`Whole server` },
              ]}
            />
          </>
        ) : null}
        <Label>{t`Sort results`}</Label>
        <Segmented
          testID="search-sort"
          label={t`Sort results`}
          value={sort}
          onChange={onSort}
          options={[
            { value: "Relevance", label: t`Relevance` },
            { value: "Latest", label: t`Latest` },
            { value: "Oldest", label: t`Oldest` },
          ]}
        />
        <Label>{labels.key("has")}</Label>
        <PillRow label={labels.key("has")} wrap>
          {HAS_VALUES.map((value) => (
            <Pill
              key={value}
              testID={`search-has-${value}`}
              label={labels.has(value)}
              on={has(value)}
              onPress={() => onQuery(has(value) ? removeFilter(query, "has", value) : addFilter(query, "has", value))}
            />
          ))}
        </PillRow>
        <RowGroup>
          <GroupRow first testID="search-pick-from" icon="user" label={t`From a member`} chevron onPress={() => setPicking("from")} />
          {inServer ? (
            <GroupRow
              testID="search-pick-in"
              icon="hash"
              label={t`In a channel`}
              chevron
              onPress={() => {
                // a channel of the server: the search then covers the server
                onScope("server");
                setPicking("in");
              }}
            />
          ) : null}
        </RowGroup>
        <Label>{t`On a day`}</Label>
        <PillRow label={t`On a day`} wrap>
          {[0, 1].map((ago) => (
            <Pill
              key={ago}
              testID={`search-day-${ago}`}
              label={ago === 0 ? t`Today` : t`Yesterday`}
              on={day === dayValue(ago)}
              onPress={() => {
                const without = removeKey(query, "during");
                onQuery(day === dayValue(ago) ? without : addFilter(without, "during", dayValue(ago)));
              }}
            />
          ))}
        </PillRow>
        <View style={{ marginTop: 8 }}>
          <Button testID="search-filters-done" label={t`Show results`} fill onPress={close} />
        </View>
      </>
    );
  }

  return (
    <Sheet visible={visible} onClose={close} testID="search-filters">
      {body}
    </Sheet>
  );
}
