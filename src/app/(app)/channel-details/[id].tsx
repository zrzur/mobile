import { useLingui } from "@lingui/react/macro";
import { router, useLocalSearchParams } from "expo-router";
import { type ReactElement, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, type ScrollViewInstance, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useChannel, useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { ChannelMenu } from "@/ui/app/ChannelMenu";
import { AText } from "@/ui/auth/parts";
import { ParagraphText } from "@/ui/kit/Text";
import { Icon, type IconName } from "@/ui/Icon";
import { isRTL } from "@/ui/kit/direction";
import { PressableRow, PressScale } from "@/ui/kit/Press";
import { type DetailsTab, centredScrollX, detailsTabs, pickTab, stripOffset } from "@/ui/search/detailsTabs";
import { FindsList } from "@/ui/search/FindsList";
import { PinsList } from "@/ui/search/PinsList";
import { GroupMemberList, MemberList } from "@/ui/profile/MemberList";
import { ThreadsList } from "@/ui/threads/ThreadsList";

/**
 * The invite row (web ChannelDetailsPhone `Group` + `Row`): a filled box,
 * 52 px, 22 px icon, 16/500 words, a caret at the end.
 */
function InviteRow({ testID, label, onPress }: { testID: string; label: string; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={{ borderRadius: 14, overflow: "hidden", backgroundColor: palette.field }}>
      <PressableRow
        testID={testID}
        accessibilityRole="button"
        highlight={palette.navSelected}
        delay={0}
        onPress={onPress}
        style={{ minHeight: 52, paddingVertical: 8, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 14 }}
      >
        <Icon name="user-plus" size={22} color={palette.iconNeutral} />
        <AText size={16} line={22} weight="medium" color={palette.fg} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
          {label}
        </AText>
        <Icon name="caret-right" size={16} color={palette.iconMuted} />
      </PressableRow>
    </View>
  );
}

/**
 * Members (web ChannelDetailsPhone `members`): the invite row, then the
 * member list in one filled box; the head and the tabs scroll with it.
 */
function MembersTab({ channelId, header }: { channelId: string; header: ReactElement }) {
  const { t } = useLingui();
  const channel = useChannel(channelId);
  const info = useFields(channel, (c) => ({
    group: c.type === "Group",
    serverId: c.serverId,
    invite: !!c.server && c.havePermission("InviteOthers"),
    addToGroup: c.type === "Group" && c.havePermission("InviteOthers"),
  }));
  // web Body: 12 px round the content, 12 px between the invite row and the list
  const top = (
    <View>
      {header}
      <View style={{ paddingTop: 12, paddingHorizontal: 12, paddingBottom: info?.invite || info?.addToGroup ? 12 : 0 }}>
        {info?.invite && info.serverId ? (
          <InviteRow testID="details-invite" label={t`Invite members`} onPress={() => router.push({ pathname: "/invite/[serverId]", params: { serverId: info.serverId! } })} />
        ) : info?.addToGroup ? (
          // a group has no invite link: its people are added from your friends
          <InviteRow testID="details-add-to-group" label={t`Add friends to group`} onPress={() => router.push({ pathname: "/new-group", params: { group: channelId } })} />
        ) : null}
      </View>
    </View>
  );
  return (
    <View testID="details-members" style={{ flex: 1 }}>
      {info?.group ? <GroupMemberList channelId={channelId} header={top} boxed /> : info?.serverId ? <MemberList serverId={info.serverId} channelId={channelId} header={top} boxed /> : top}
    </View>
  );
}

/**
 * Phones: everything about a channel on one screen (web: ChannelDetailsPhone):
 *
 * [back]       [search] [notifications] [settings]
 * # name
 * Text channel · Server
 * the channel's description
 * Members · Media · Pins · Threads · Links · Files
 *
 * `tab` opens a tab directly (the header's Threads, the More sheet's pins
 * and members).
 */
export default function ChannelDetails() {
  const { id, tab: wanted } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { t } = useLingui();
  const { palette } = useTheme();
  const channel = useChannel(id);
  const head = useFields(channel, (c) => ({
    type: c.type,
    // a group or DM can hold a call, but only a server channel is a voice channel
    isVoice: c.isVoice && c.type === "TextChannel",
    isThread: c.isThread,
    isForum: c.isForum,
    name: c.type === "DirectMessage" ? (c.recipient?.displayName ?? c.recipient?.username ?? "") : c.type === "SavedMessages" ? "" : (c.name ?? ""),
    description: c.description ?? "",
    server: c.server?.name,
    // web canOpenSettings: a group, or a server's channel, to someone who manages it
    canSettings: (c.type === "Group" || !!c.serverId) && c.orPermission("ManageChannel", "ManagePermissions"),
  }));
  const tabs = head ? detailsTabs(head) : [];
  const [chosen, setChosen] = useState<DetailsTab | undefined>(undefined);
  const [bell, setBell] = useState(false);
  const tab = tabs.length ? pickTab(tabs, chosen ?? wanted) : undefined;
  const tabsRef = useRef<ScrollViewInstance>(null);
  const tabX = useRef<Record<string, { x: number; width: number }>>({});
  const strip = useRef({ width: 0, content: 0 });
  // the tabs scroll with the page and mount again with each tab's list: keep where the strip was
  const stripX = useRef<number | null>(null);
  const showStrip = (animated: boolean) => {
    if (stripX.current === null || !strip.current.width) return;
    tabsRef.current?.scrollTo({ x: stripOffset(stripX.current, strip.current.width, strip.current.content, Platform.OS === "web" && isRTL()), animated });
  };

  const labels: Record<DetailsTab, string> = {
    members: t`Members`,
    media: t`Media`,
    pins: t`Pins`,
    threads: t`Threads`,
    links: t`Links`,
    files: t`Files`,
  };
  const what = !head
    ? ""
    : head.isVoice
      ? t`Voice channel`
      : head.type === "Group"
        ? t`Group`
        : head.type === "DirectMessage"
          ? t`Direct message`
          : head.type === "SavedMessages"
            ? t`Saved notes`
            : t`Text channel`;
  const kind = head?.server ? [what, head.server] : [what];
  const name = head?.type === "SavedMessages" ? t`Saved notes` : (head?.name ?? "");

  const header = (
    <View>
      {/* web Head: 4 px under the top bar, 18 px in, 14 px above the tabs */}
      <View style={{ paddingTop: 4, paddingHorizontal: 18, paddingBottom: 14, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Icon name={head?.isVoice ? "speaker-high" : "hash"} size={22} color={palette.muted} />
          <AText autoDir size={22} line={30} weight="bold" color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }} accessibilityRole="header" testID="details-name">
            {name}
          </AText>
        </View>
        {/* web Kind: each part on its own, a dot between, wrapping as a whole */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 6 }}>
          {kind.map((part, index) => (
            <View key={index} style={{ flexDirection: "row", columnGap: 6 }}>
              {index > 0 ? (
                <AText size={13} line={20} color={palette.muted} aria-hidden>
                  {"·"}
                </AText>
              ) : null}
              <AText autoDir size={13} line={20} color={palette.muted}>
                {part}
              </AText>
            </View>
          ))}
        </View>
        {head?.description ? (
          <ParagraphText size={14} line={22} color={palette.fg2} containerStyle={{ marginTop: 4 }} testID="details-description">
            {head.description}
          </ParagraphText>
        ) : null}
      </View>
      {/* web Tabs: 10 px in, 4 px apart, each 10 px across; the chosen one in the primary ink with the accent bar over the line */}
      <ScrollView
        ref={tabsRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel={t`Channel details`}
        onLayout={(e) => {
          strip.current.width = e.nativeEvent.layout.width;
          showStrip(false);
        }}
        onContentSizeChange={(w) => {
          strip.current.content = w;
          showStrip(false);
        }}
        contentContainerStyle={{ paddingHorizontal: 10, gap: 4 }}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: palette.borderSubtle }}
      >
        {tabs.map((item) => {
          const on = item === tab;
          return (
            <Pressable
              key={item}
              testID={`details-tab-${item}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onLayout={(e) => {
                tabX.current[item] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
              }}
              onPress={() => {
                setChosen(item);
                const at = tabX.current[item];
                if (!at) return;
                stripX.current = centredScrollX(at.x, at.width, strip.current.width, strip.current.content);
                showStrip(true);
              }}
              style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: "center" }}
            >
              <AText size={15} line={20} weight={on ? "semibold" : "medium"} color={on ? palette.fg : palette.muted} numberOfLines={1}>
                {labels[item]}
              </AText>
              {on ? <View style={{ position: "absolute", start: 10, end: 10, bottom: -1, height: 2, borderRadius: 2, backgroundColor: palette.accent }} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      {/* web Top: no title on a phone, 56 px under an 8 px gap, 6 px in, no line under it */}
      <View style={{ minHeight: 64, paddingTop: 8, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: palette.frame }}>
        <TopButton testID="header-back" icon="arrow-left" label={t`Back`} onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
        <View style={{ flex: 1 }} />
        {/* web: the channel's own search, in this channel */}
        <TopButton testID="details-search" icon="magnifying-glass" label={t`Search messages`} onPress={() => router.push({ pathname: "/search/[id]", params: { id } })} />
        {head && head.type !== "SavedMessages" ? <TopButton testID="details-notifications" icon="bell" label={t`Notifications`} onPress={() => setBell(true)} /> : null}
        {head?.canSettings ? (
          <TopButton testID="channel-details-settings" icon="gear-six" label={t`Channel settings`} onPress={() => router.push({ pathname: "/channel-settings/[id]", params: { id } })} />
        ) : null}
      </View>
      {!head || !tab ? (
        <ActivityIndicator color={palette.accent} style={{ marginTop: 48 }} />
      ) : tab === "members" ? (
        <MembersTab key="members" channelId={id} header={header} />
      ) : tab === "pins" ? (
        <PinsList key="pins" channelId={id} header={header} />
      ) : tab === "threads" ? (
        <ThreadsList key="threads" channelId={id} header={header} />
      ) : (
        <FindsList key={tab} channelId={id} kind={tab} header={header} />
      )}
      {bell ? <ChannelMenu channelId={id} visible startPage="level" onClose={() => setBell(false)} /> : null}
    </SafeAreaView>
  );
}

/** web TopButton: 44 px, radius 12, a 22 px icon in the secondary ink, a tint while pressed */
function TopButton({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID: string }) {
  const { palette } = useTheme();
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scale={0.92}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navSelected : "transparent" })}
    >
      <Icon name={icon} size={22} color={palette.fg2} />
    </PressScale>
  );
}
