/**
 * One community design in a sheet (web Designs.tsx DesignDialog): a large
 * preview on your own profile, who made it, what it is, and Apply / Remove,
 * Save to favourites and Report.
 */
import { Trans, useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { intlLocale } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { AText, Button, Icon, PressScale, SheetModal, haptics } from "@/ui/kit";

import {
  type CommunityCreator,
  type CommunityItem,
  communityApi,
  creatorName,
  hasOpenPage,
} from "./api";
import { DesignsError } from "./Dock";
import { wearOf } from "./hooks";
import { Mirror } from "./Mirror";
import { CreatorFace, useEditStyle, useMe } from "./parts";
import { tryOnStore } from "./tryOn";
import type { UserStyle } from "./style";

/** The style field a community design wears in */
export const fieldOf = (
  item: Pick<CommunityItem, "kind">,
): "decoration" | "nameplate" | "effect" | "profile_frame" =>
  item.kind === "Nameplate"
    ? "nameplate"
    : item.kind === "Effect"
      ? "effect"
      : item.kind === "Frame"
        ? "profile_frame"
        : "decoration";

/** Wear a design (or take one off with `undefined`) straight away, keeping the rest (web useWearDesign) */
export function useWearDesign() {
  const me = useMe();
  const edit = useEditStyle();
  return async (
    field: ReturnType<typeof fieldOf>,
    ref: string | undefined,
    file?: string,
  ) => {
    const next: UserStyle = {
      ...(me?.style ?? {}),
      [field]: ref,
      [`${field}_file`]: ref ? file : undefined,
    };
    // a new effect is looked up by the server
    if (field === "effect") delete next.effect_file;
    // never before your profile has loaded: the rest of your look would go
    if (!me) return;
    await edit(next);
    // what you try on follows what you now wear
    if (tryOnStore.get().draft)
      tryOnStore.put({
        [field]: ref,
        [`${field}_file`]: ref ? file : undefined,
      });
  };
}

/** "by <name>" with their avatar (web CreatorChip); opens their page, or their profile */
export function CreatorChip({
  creator,
  verbose,
  onPress,
  testID,
}: {
  creator: CommunityCreator;
  verbose?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <PressScale
      testID={testID}
      accessibilityRole="link"
      accessibilityHint={t`View profile`}
      onPress={
        onPress ?? (() => router.push(`/profile/${creator._id}` as never))
      }
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        alignSelf: "flex-start",
      }}
    >
      <CreatorFace creator={creator} size={22} />
      <AText
        autoDir
        size={14}
        line={20}
        weight="semibold"
        color={palette.fg}
        numberOfLines={1}
        style={{ flexShrink: 1 }}
      >
        <Trans>
          by{" "}
          <AText size={14} line={20} weight="semibold" color={palette.fg}>
            {creatorName(creator)}
          </AText>
        </Trans>
      </AText>
      {verbose && creator.verified ? (
        <View
          style={{
            height: 24,
            paddingHorizontal: 8,
            borderRadius: 6,
            justifyContent: "center",
            backgroundColor: palette.field,
          }}
        >
          <AText size={12} line={16} weight="semibold" color={palette.fg2}>
            {t`Verified creator`}
          </AText>
        </View>
      ) : null}
    </PressScale>
  );
}

type SheetProps = {
  onClose: () => void;
  onChanged: () => void;
  onReport: (item: CommunityItem) => void;
};

export function DesignSheet({
  item: given,
  ...props
}: { item: CommunityItem | null } & SheetProps) {
  // the last design stays drawn while the sheet slides away
  const [shown, setShown] = useState(given);
  if (given && given !== shown) setShown(given);
  return (
    <SheetModal
      visible={!!given}
      onClose={props.onClose}
      scroll
      testID="design-sheet"
    >
      {shown ? <SheetBody key={shown._id} given={shown} {...props} /> : null}
    </SheetModal>
  );
}

function SheetBody({
  given,
  onClose,
  onChanged,
  onReport,
}: { given: CommunityItem } & SheetProps) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const me = useMe();
  const wear = useWearDesign();
  const [details, setDetails] = useState<{
    item: CommunityItem;
    creator?: CommunityCreator;
  }>();
  const [favourite, setFavourite] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let live = true;
    communityApi
      .details(client, given._id)
      .then((answer) => live && setDetails(answer))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [given, client]);

  const item = details?.item ?? given;
  const field = fieldOf(item);
  const ref = `c:${item._id}`;
  const wearing = me?.style[field] === ref;
  const isFavourite = favourite ?? !!item.favourite;
  const worn: UserStyle = { ...(me?.style ?? {}), ...wearOf(item) };
  const date = item.published_at
    ? new Intl.DateTimeFormat(intlLocale(i18n.locale), {
        dateStyle: "medium",
      }).format(new Date(item.published_at))
    : "";
  const creator = details?.creator;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      onChanged();
      return true;
    } catch (failure) {
      setError(failure);
      haptics.error();
      return false;
    } finally {
      setBusy(false);
    }
  }

  const kindLabel =
    item.kind === "Decoration"
      ? t`Avatar decoration`
      : item.kind === "Effect"
        ? t`Profile effect`
        : item.kind === "Frame"
          ? t`Profile frame`
          : t`Nameplate`;

  return (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <AText
        autoDir
        size={17}
        line={24}
        weight="bold"
        color={palette.header}
        accessibilityRole="header"
      >
        {item.name}
      </AText>
      <Mirror style={worn} />
      {creator ? (
        <CreatorChip
          creator={creator}
          verbose
          testID="design-sheet-creator"
          onPress={
            hasOpenPage(creator)
              ? () => {
                  onClose();
                  router.push(`/designs/creator/${item.creator_id}` as never);
                }
              : undefined
          }
        />
      ) : null}
      {item.description ? (
        <AText autoDir size={14} line={20} color={palette.fg2}>
          {item.description}
        </AText>
      ) : null}
      {item.tags?.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {item.tags.map((tag) => (
            <View
              key={tag}
              style={{
                height: 24,
                paddingHorizontal: 9,
                borderRadius: 6,
                justifyContent: "center",
                backgroundColor: palette.field,
              }}
            >
              <AText size={12} line={16} color={palette.fg2}>
                #{tag}
              </AText>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        <Fact icon="users-three" text={t`Worn by ${item.popularity}`} />
        {date ? <Fact icon="clock" text={t`Published ${date}`} /> : null}
        <Fact
          icon={
            item.kind === "Decoration" ? "user-circle" : "identification-card"
          }
          text={kindLabel}
        />
      </View>
      {error ? <DesignsError error={error} /> : null}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          marginTop: 4,
        }}
      >
        {wearing ? (
          <Button
            label={t`Remove`}
            variant="tonal"
            disabled={busy || !me}
            onPress={() => void run(() => wear(field, undefined))}
            testID="design-sheet-remove"
          />
        ) : (
          <Button
            label={t`Apply`}
            disabled={busy || !me}
            onPress={() =>
              void run(() => wear(field, ref, item.file._id)).then(
                (done) => done && haptics.success(),
              )
            }
            testID="design-sheet-apply"
          />
        )}
        <PressScale
          testID="design-sheet-favourite"
          accessibilityRole="button"
          accessibilityLabel={
            isFavourite ? t`Remove from favourites` : t`Add to favourites`
          }
          accessibilityState={{ selected: isFavourite }}
          aria-pressed={isFavourite}
          haptic="light"
          onPress={() => {
            const on = !isFavourite;
            setFavourite(on);
            void run(() => communityApi.favourite(client, item._id, on)).then(
              (done) => !done && setFavourite(!on),
            );
          }}
          style={({ pressed }) => ({
            minHeight: 44,
            paddingHorizontal: 16,
            borderRadius: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: pressed ? palette.navSelected : palette.field,
          })}
        >
          <Icon
            name="heart"
            size={16}
            color={isFavourite ? palette.accent : palette.fg}
          />
          <AText size={14} line={20} weight="semibold" color={palette.fg}>
            {isFavourite ? t`Saved` : t`Save`}
          </AText>
        </PressScale>
        {item.creator_id !== me?.id ? (
          <PressScale
            testID="design-sheet-report"
            accessibilityRole="button"
            onPress={() => onReport(item)}
            style={({ pressed }) => ({
              minHeight: 44,
              paddingHorizontal: 8,
              borderRadius: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: pressed ? palette.navHover : "transparent",
            })}
          >
            <Icon name="flag" size={14} color={palette.muted} />
            <AText size={14} line={20} weight="semibold" color={palette.muted}>
              {t`Report`}
            </AText>
          </PressScale>
        ) : null}
      </View>
      {wearing ? (
        <View
          testID="design-sheet-wearing"
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <Icon name="check" size={13} color={palette.onlineText} />
          <AText size={13} line={18} color={palette.muted} style={{ flex: 1 }}>
            {t`You're wearing this. Everyone sees it on your profile.`}
          </AText>
        </View>
      ) : null}
    </View>
  );
}

function Fact({
  icon,
  text,
}: {
  icon: "users-three" | "clock" | "user-circle" | "identification-card";
  text: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <Icon name={icon} size={14} color={palette.muted} />
      <AText size={13} line={18} color={palette.muted}>
        {text}
      </AText>
    </View>
  );
}
