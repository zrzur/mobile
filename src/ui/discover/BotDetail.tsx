import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/Avatar";
import { fileUrl } from "@/ui/invite/media";
import { AText, Button, Icon, ParagraphText, Sheet, copyToClipboard, openExternal } from "@/ui/kit";
import { BadgeMark, BotLabel } from "@/ui/profile/parts";

import { discoverApi } from "./api";
import { ListingBanner, MarkPill, TagRow } from "./Cards";
import { useDiscoverLabels, usePermissionTitles } from "./labels";
import { type BotInvite, type Listing, SENSITIVE, detailGroups, hasBit, listedCommands, listingBadge, listingMark, plainDescription, safeLink } from "./logic";

/** A part of the page: a 15/700 heading and its content */
function Part({ title, children, testID }: { title: string; children: React.ReactNode; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 8 }} testID={testID}>
      <AText size={15} line={22} weight="bold" color={palette.header} accessibilityRole="header">
        {title}
      </AText>
      {children}
    </View>
  );
}

/** One fact: a label and its value on one line */
export function Fact({ label, value, live }: { label: string; value: string; live?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 32 }}>
      <AText size={14} line={20} color={palette.muted}>
        {label}
      </AText>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
        {live ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.online }} /> : null}
        <AText size={14} line={20} weight="semibold" color={palette.fg} numberOfLines={1}>
          {value}
        </AText>
      </View>
    </View>
  );
}

/** Big numbers in Latin digits, like the rest of the app */
export function useNumber() {
  const { i18n } = useLingui();
  return (value: number) => {
    try {
      return new Intl.NumberFormat(i18n.locale || "en", { numberingSystem: "latn" }).format(value);
    } catch {
      return String(value);
    }
  };
}

/**
 * A bot's page over Discover, as a sheet from the bottom (web ListingDetail
 * on phones): how it shows up in a chat, its commands, what it is about, the
 * facts, and in plain words what it may do on a server. A part with nothing
 * true to say is left out. "Add to server" opens the add-bot page.
 */
export function BotDetail({
  listing,
  cdn,
  onClose,
  onTag,
  onAdd,
  onReport,
}: {
  listing: Listing | null;
  cdn?: string;
  onClose: () => void;
  onTag?: (tag: string) => void;
  onAdd: (id: string) => void;
  onReport: (listing: Listing) => void;
}) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const labels = useDiscoverLabels();
  const titles = usePermissionTitles();
  const number = useNumber();
  const [inviteOf, setInviteOf] = useState<{ id: string; value: BotInvite }>();
  const [commandsOf, setCommandsOf] = useState<{ id: string; value: Parameters<typeof listedCommands>[0] }>();
  const [copied, setCopied] = useState(false);
  const id = listing?.id;
  // answers belong to one bot: another bot's never shows here
  const invite = inviteOf?.id === id ? inviteOf?.value : undefined;
  const registered = commandsOf?.id === id ? commandsOf?.value : undefined;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    discoverApi.botInvite(client, id).then((value) => alive && setInviteOf({ id, value }), () => undefined);
    discoverApi.botCommands(client, id).then((value) => alive && setCommandsOf({ id, value }), () => undefined);
    return () => {
      alive = false;
    };
  }, [client, id]);

  const content = (() => {
    if (!listing) return null;
    const badge = listingBadge(listing);
    const commands = listedCommands(registered, listing.description, i18n.locale);
    const firstLine = plainDescription(listing.description?.split(/\n/)[0]) || undefined;
    const moreToSay = (listing.description ?? "").includes("\n");
    const groups = detailGroups(invite?.default_permissions);
    const sensitive = invite?.default_permissions !== undefined && SENSITIVE.some((bit) => hasBit(invite.default_permissions!, bit));
    const privacy = safeLink(invite?.privacy_policy_url);
    const terms = safeLink(invite?.terms_of_service_url);
    const avatar = fileUrl(cdn, "avatars", listing.icon);
    const link = `https://app.zrzur.com/discover/bots/${listing.id}`;
    return (
      <>
        <View style={{ marginHorizontal: -16, marginTop: -12 }}>
          <ListingBanner listing={listing} cdn={cdn} height={120} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: -56, gap: 8 }}>
          <View style={{ padding: 4, borderRadius: 999, backgroundColor: palette.frame }}>
            <Avatar url={avatar} name={listing.name} size={88} />
          </View>
          {listingMark(listing) ? <MarkPill listing={listing} /> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <AText autoDir size={22} line={30} weight="bold" color={palette.header} accessibilityRole="header" style={{ flexShrink: 1 }}>
            {listing.name}
          </AText>
          {badge ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <BadgeMark id={badge} size={16} />
              <AText size={13} line={18} weight="semibold" color={palette.fg2}>
                {t`Verified`}
              </AText>
            </View>
          ) : null}
        </View>

        {firstLine ? (
          <Part title={t`In your chat`}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", gap: 12, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
              <Avatar url={avatar} name={listing.name} size={40} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <AText size={15} line={20} weight="semibold" color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {listing.name}
                  </AText>
                  <BotLabel verified={listing.verified} />
                </View>
                <AText autoDir size={15} line={22} color={palette.fg2}>
                  {firstLine}
                </AText>
              </View>
            </View>
          </Part>
        ) : null}

        {commands.items.length ? (
          <Part title={t`Commands`} testID="bot-commands">
            {commands.source === "registered" ? (
              <View style={{ gap: 8 }}>
                {commands.items.map((command) => (
                  <View key={command.name} style={{ gap: 2 }}>
                    <AText size={14} line={20} weight="semibold" color={palette.fg} style={{ fontFamily: "monospace" }}>
                      {`/${command.name}`}
                    </AText>
                    {command.description ? (
                      <AText autoDir size={13} line={20} color={palette.fg2}>
                        {command.description}
                      </AText>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {commands.items.map((command) => (
                    <View key={command.name} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: palette.tonal }}>
                      <AText size={13} line={20} color={palette.fg} style={{ fontFamily: "monospace" }}>
                        {`/${command.name}`}
                      </AText>
                    </View>
                  ))}
                </View>
                <AText size={12} line={16} color={palette.muted}>
                  {t`Named in the bot's description.`}
                </AText>
              </>
            )}
          </Part>
        ) : null}

        {!firstLine || moreToSay ? (
          <Part title={t`About this bot`}>
            {listing.description?.trim() ? (
              // each line in its own direction (an Arabic line on the right in the English app)
              <ParagraphText size={15} line={22} color={palette.fg2} selectable>
                {listing.description.trim()}
              </ParagraphText>
            ) : (
              <AText size={15} line={22} color={palette.muted}>
                {t`No description yet.`}
              </AText>
            )}
          </Part>
        ) : null}

        <Part title={t`Bot details`}>
          <View>
            <Fact label={t`Servers`} value={number(listing.count)} />
            {listing.category ? <Fact label={t`Category`} value={labels.category(listing.category)} /> : null}
            {listing.language ? <Fact label={t`Language`} value={labels.language(listing.language)} /> : null}
          </View>
          {listing.tags.length ? <TagRow tags={listing.tags} onTag={onTag} /> : null}
        </Part>

        {invite ? (
          <Part title={t`On a server the bot gets:`}>
            {groups.length ? (
              <View style={{ gap: 12 }}>
                {groups.map((group) => (
                  <View key={group.id} style={{ gap: 4 }}>
                    <AText size={12} line={16} weight="bold" color={palette.muted}>
                      {titles.group(group.id)}
                    </AText>
                    {group.bits.map((bit) => (
                      <View key={bit} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 }}>
                        <Icon name={SENSITIVE.includes(bit) ? "warning" : "check"} size={16} color={SENSITIVE.includes(bit) ? palette.warningText : palette.onlineText} />
                        <AText size={14} line={20} color={palette.fg} style={{ flexShrink: 1 }}>
                          {titles.name(bit)}
                        </AText>
                      </View>
                    ))}
                  </View>
                ))}
                {sensitive ? (
                  <AText size={12} line={16} color={palette.muted}>
                    {t`Lets the bot change the server or remove people.`}
                  </AText>
                ) : null}
              </View>
            ) : (
              <AText size={14} line={20} color={palette.fg2}>
                {t`The bot will not be granted any permissions.`}
              </AText>
            )}
            {privacy || terms ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {privacy ? (
                  <Pressable accessibilityRole="link" onPress={() => void openExternal(privacy)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <AText size={14} line={20} weight="semibold" color={palette.link}>
                      {t`Privacy policy`}
                    </AText>
                    <Icon name="arrow-square-out" size={16} color={palette.link} />
                  </Pressable>
                ) : null}
                {terms ? (
                  <Pressable accessibilityRole="link" onPress={() => void openExternal(terms)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <AText size={14} line={20} weight="semibold" color={palette.link}>
                      {t`Terms of Service`}
                    </AText>
                    <Icon name="arrow-square-out" size={16} color={palette.link} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </Part>
        ) : null}

        <View style={{ gap: 8, marginTop: 8 }}>
          <Button testID="bot-add" icon="plus" label={t`Add to server`} onPress={() => onAdd(listing.id)} fill />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                fill
                variant="tonal"
                icon={copied ? "check" : "link"}
                label={copied ? t`Copied` : t`Copy link`}
                onPress={async () => {
                  await copyToClipboard(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button fill variant="tonal" icon="flag" label={t`Report`} testID="bot-report" onPress={() => onReport(listing)} />
            </View>
          </View>
        </View>
      </>
    );
  })();

  return (
    <Sheet visible={!!listing} onClose={onClose} testID="bot-detail" detents={[0.7, 1]}>
      {content}
    </Sheet>
  );
}
