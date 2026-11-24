import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Image } from "expo-image";
import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/Avatar";
import { type IconName } from "@/ui/Icon";
import { fileUrl } from "@/ui/invite/media";
import { AText, Icon, PressableRow, Sheet, Skeleton } from "@/ui/kit";
import { BadgeMark, BotLabel, Gradient } from "@/ui/profile/parts";
import { mixColours } from "@/ui/profile/theme";

import { useDiscoverLabels, useTierName } from "./labels";
import { type DiscoverKind, type Listing, categoryIcon, isPaidListing, isPaidMark, listingBadge, listingMark, plainDescription } from "./logic";

/** Card height: the fullest one (three lines of words, two of tags); every card takes it */
export const CARD_HEIGHT = 360;
const BANNER = 100;
const RING = 60;

/** "# members" or "In # servers", the count under a listing */
export function useCountLabel() {
  const { t } = useLingui();
  return (kind: DiscoverKind, count: number) =>
    kind === "servers"
      ? t`${plural(Number(count), { one: "# member", other: "# members" })}`
      : t`${plural(Number(count), { 0: "Not in any servers yet", one: "In # server", other: "In # servers" })}`;
}

/** The banner: the listing's own artwork, or a calm tone of its own */
export function ListingBanner({ listing, cdn, height }: { listing: Listing; cdn?: string; height: number }) {
  const { palette } = useTheme();
  const url = fileUrl(cdn, "banners", listing.banner);
  return (
    <View style={{ height, backgroundColor: palette.tonal, overflow: "hidden" }}>
      {url ? (
        <Image source={{ uri: url }} style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0 }} contentFit="cover" cachePolicy="memory-disk" accessibilityIgnoresInvertColors />
      ) : (
        <Gradient from={mixColours(palette.tonal, palette.accent, 0.55)} to={mixColours(palette.frame, palette.accent, 0.18)} diagonal />
      )}
    </View>
  );
}

/** "Ad" and the "?" that says why it is shown (web AdLabel); the note opens as a sheet */
export function AdLabel({ kind, name }: { kind: DiscoverKind; name: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View testID="ad-label" style={{ flexDirection: "row", alignItems: "center", height: 28, borderRadius: 999, paddingStart: 8, backgroundColor: palette.floating, borderWidth: 1, borderColor: palette.borderStrong }}>
      <AText size={12} line={14} weight="bold" color={palette.fg}>
        {t({ id: "discover.paid.ad", message: "Ad" })}
      </AText>
      <Pressable
        testID="ad-why"
        accessibilityRole="button"
        accessibilityLabel={t`Why am I seeing this?`}
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={{ width: 44, height: 44, marginVertical: -8, alignItems: "center", justifyContent: "center" }}
      >
        <AText size={12} line={14} weight="bold" color={palette.fg2}>
          ?
        </AText>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} testID="ad-note">
        <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
          {t`Why am I seeing this?`}
        </AText>
        <AText size={15} line={22} color={palette.fg2}>
          {kind === "bots" ? (
            <Trans>
              Paid placement for <AText size={15} line={22} weight="semibold" color={palette.fg}>{name.toString()}</AText>, bought by the owner of this bot. Everyone browsing bots on Discover sees it in the same place. It is not chosen using your data or messages.
            </Trans>
          ) : (
            <Trans>
              Paid placement for <AText size={15} line={22} weight="semibold" color={palette.fg}>{name.toString()}</AText>, bought by a manager of this server. Everyone who can see this server on Discover sees it in the same place. It is not chosen using your data or messages.
            </Trans>
          )}
        </AText>
      </Sheet>
    </View>
  );
}

/** A small pill for a listing's mark; paid places say so, as an ad (web MarkPill) */
export function MarkPill({ listing }: { listing: Listing }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const tierName = useTierName();
  const mark = listingMark(listing);
  if (!mark) return null;
  const label = mark === "promoted" ? tierName("TopRow") : mark === "headline" ? tierName("MegaBoost") : mark === "spotlight" ? tierName("SuperBoost") : mark === "boosted" ? tierName("Boost") : t`Hand-picked`;
  const icon: IconName = mark === "promoted" ? "megaphone" : mark === "picked" ? "seal-check" : "lightning";
  const headline = mark === "headline";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          height: 24,
          paddingHorizontal: 8,
          borderRadius: 999,
          backgroundColor: headline ? palette.accent : palette.floating,
          borderWidth: 1,
          borderColor: headline ? "transparent" : isPaidMark(mark) ? palette.accent : palette.borderStrong,
        }}
      >
        <Icon name={icon} size={12} color={headline ? palette.onAccent : palette.fg2} />
        <AText size={12} line={14} weight="bold" color={headline ? palette.onAccent : palette.fg} numberOfLines={1}>
          {label}
        </AText>
      </View>
      {isPaidMark(mark) ? <AdLabel kind={listing.kind} name={listing.name} /> : null}
    </View>
  );
}

/** "Gaming · Arabic", the line under a name */
export function ListingMeta({ listing }: { listing: Listing }) {
  const { palette } = useTheme();
  const labels = useDiscoverLabels();
  if (!listing.category && !listing.language) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 }}>
      {listing.category ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name={categoryIcon(listing.kind, listing.category) as IconName} size={14} color={palette.iconMuted} />
          <AText size={12} line={16} weight="semibold" color={palette.muted}>
            {labels.category(listing.category)}
          </AText>
        </View>
      ) : null}
      {listing.language ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name="globe" size={14} color={palette.iconMuted} />
          <AText size={12} line={16} weight="semibold" color={palette.muted}>
            {labels.language(listing.language)}
          </AText>
        </View>
      ) : null}
    </View>
  );
}

/** "#tag" labels; `onTag` makes them filters (44 px targets) */
export function TagRow({ tags, onTag, max }: { tags: string[]; onTag?: (tag: string) => void; max?: number }) {
  const { palette } = useTheme();
  const shown = max ? tags.slice(0, max) : tags;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: onTag ? 8 : 4 }}>
      {shown.map((tag) => {
        const body = (
          <AText size={onTag ? 13 : 12} line={16} weight="semibold" color={palette.fg2} numberOfLines={1}>
            <AText size={onTag ? 13 : 12} line={16} weight="bold" color={palette.accentText}>
              #
            </AText>
            {tag}
          </AText>
        );
        return onTag ? (
          <Pressable
            key={tag}
            testID={`discover-tag-${tag}`}
            accessibilityRole="button"
            onPress={() => onTag(tag)}
            style={({ pressed }) => ({ height: 44, paddingHorizontal: 12, borderRadius: 999, justifyContent: "center", backgroundColor: pressed ? palette.navSelected : palette.field })}
          >
            {body}
          </Pressable>
        ) : (
          <View key={tag} style={{ height: 24, paddingHorizontal: 8, borderRadius: 6, justifyContent: "center", backgroundColor: palette.tonal }}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

/**
 * A Discover listing card, one size for all (web ListingCard): the banner
 * with the icon over its edge and a paid mark, the name, what it is about,
 * the tags, and a last row with who is there and the action. The whole card
 * opens the details; the action is its own button beside that one.
 */
export function ListingCard({ listing, cdn, onOpen, action }: { listing: Listing; cdn?: string; onOpen: () => void; action?: ReactNode }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const count = useCountLabel();
  const about = plainDescription(listing.description);
  const badge = listingBadge(listing);
  const paid = isPaidListing(listing);
  const bot = listing.kind === "bots";
  return (
    <View
      testID={`discover-card-${listing.id}`}
      style={{ minHeight: CARD_HEIGHT, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: palette.borderSubtle, backgroundColor: palette.field }}
    >
      <PressableRow
        testID={`discover-${listing.id}`}
        accessibilityRole="button"
        // paid places say "Ad" to a screen reader too
        accessibilityLabel={paid ? `${listing.name}, ${t({ id: "discover.paid.ad", message: "Ad" })}` : listing.name}
        highlight={palette.navSelected}
        onPress={onOpen}
        style={{ flex: 1 }}
      >
        {({ pressed }) => (
          <>
            <ListingBanner listing={listing} cdn={cdn} height={BANNER} />
            <View style={{ marginTop: -RING / 2, marginStart: 8, alignSelf: "flex-start", padding: 4, borderRadius: bot ? 999 : 18, backgroundColor: pressed ? palette.navSelected : palette.field }}>
              <Avatar url={fileUrl(cdn, bot ? "avatars" : "icons", listing.icon)} name={listing.name} size={52} square={!bot} />
            </View>
            <View style={{ paddingHorizontal: 12, paddingTop: 8, gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 }}>
                <AText autoDir size={15} line={24} weight="semibold" color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {listing.name}
                </AText>
                {badge ? <BadgeMark id={badge} size={16} /> : null}
                {bot ? <BotLabel verified={listing.verified} /> : null}
              </View>
              <AText autoDir={about || undefined} autoAlign={!!about} size={13} line={20} color={about ? palette.fg2 : palette.muted} numberOfLines={3}>
                {about || t`No description yet.`}
              </AText>
              {listing.tags.length ? (
                <View style={{ marginTop: 4, maxHeight: 52, overflow: "hidden" }}>
                  <TagRow tags={listing.tags} max={5} />
                </View>
              ) : null}
            </View>
          </>
        )}
      </PressableRow>
      {paid ? (
        <View style={{ position: "absolute", top: 8, end: 8 }}>
          <MarkPill listing={listing} />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8 }}>
        <View style={{ flex: 1, minHeight: 48, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name={bot ? "robot" : "users"} size={16} color={palette.accentText} />
          <AText size={12} line={16} weight="semibold" color={palette.fg2} style={{ flexShrink: 1 }}>
            {count(listing.kind, listing.count)}
          </AText>
        </View>
        {action}
      </View>
    </View>
  );
}

/** A heading over a group of cards, with "See all" at its end (web Section) */
export function SectionHead({ icon, title, onMore }: { icon: IconName; title: string; onMore?: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
        <Icon name={icon} size={20} color={palette.accentText} />
        <AText size={17} line={24} weight="bold" color={palette.header} accessibilityRole="header" numberOfLines={1}>
          {title}
        </AText>
      </View>
      {onMore ? (
        <Pressable
          testID="discover-see-all"
          accessibilityRole="button"
          onPress={onMore}
          style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, backgroundColor: pressed ? palette.navHover : "transparent" })}
        >
          <AText size={14} line={20} weight="semibold" color={palette.link}>
            {t`See all`}
          </AText>
          <Icon name="caret-right" size={16} color={palette.link} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Cards that hold the place while the list loads */
export function CardSkeletons({ count }: { count: number }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 12 }} testID="discover-loading">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ height: CARD_HEIGHT, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: palette.borderSubtle, padding: 12, gap: 12 }}>
          <Skeleton width="100%" height={BANNER - 12} radius={10} />
          <Skeleton width={52} height={52} radius={14} />
          <Skeleton width="60%" height={18} />
          <Skeleton width="90%" height={14} />
          <Skeleton width="80%" height={14} />
        </View>
      ))}
    </View>
  );
}
