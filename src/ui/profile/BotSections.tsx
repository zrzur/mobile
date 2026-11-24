import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { User } from "@zrzur/sdk/solid";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/Avatar";
import { Icon, type IconName } from "@/ui/Icon";
import { autoDirStyle } from "@/ui/kit/bidi";
import { openExternal } from "@/ui/kit/openLink";
import { AText } from "@/ui/kit/Text";

import { botCommands, botStanding, creatorShown, safeLink, SHOWN_COMMANDS } from "./botAbout";
import { Section, useInk } from "./parts";
import { openProfile } from "./store";

type PublicBot = Awaited<ReturnType<ReturnType<typeof useClient>["bots"]["fetchPublic"]>>;
type Commands = Awaited<ReturnType<ReturnType<typeof useClient>["bots"]["fetchPublicCommands"]>>;

// kept for the app session: opening the same bot again sends no request
const bots = new Map<string, Promise<PublicBot | undefined>>();
const commandLists = new Map<string, Promise<Commands | undefined>>();

function usePublicBot(id: string): { bot?: PublicBot; loading: boolean } {
  const client = useClient();
  const [state, setState] = useState<{ id: string; bot?: PublicBot; loading: boolean }>({ id, loading: true });
  useEffect(() => {
    let live = true;
    let request = bots.get(id);
    if (!request) {
      request = client.bots.fetchPublic(id).catch(() => undefined);
      bots.set(id, request);
    }
    void request.then((bot) => live && setState({ id, bot, loading: false }));
    return () => {
      live = false;
    };
  }, [client, id]);
  return state.id === id ? state : { loading: true };
}

function useCommands(id: string): Commands | undefined {
  const client = useClient();
  const [state, setState] = useState<{ id: string; list?: Commands }>({ id });
  useEffect(() => {
    let live = true;
    let request = commandLists.get(id);
    if (!request) {
      request = client.bots.fetchPublicCommands(id).catch(() => undefined);
      commandLists.set(id, request);
    }
    void request.then((list) => live && setState({ id, list }));
    return () => {
      live = false;
    };
  }, [client, id]);
  return state.id === id ? state.list : undefined;
}

function Fact({ icon, tone, children }: { icon: IconName; tone?: string; children: string }) {
  const ink = useInk();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 20 }}>
      <Icon name={icon} size={16} color={tone ?? ink.muted} />
      <AText size={13} line={20} color={tone ? ink.ink : ink.ink2} style={{ flexShrink: 1 }}>
        {children}
      </AText>
    </View>
  );
}

/**
 * A bot's sections (web: ProfileBotAbout, ProfileOwner, ProfileCommands),
 * after the profile's own sections and before Roles: whether Zrzur verified
 * it and how many servers it is in, its privacy policy and terms, who made
 * it, and its slash commands.
 */
export function BotSections({ user, first }: { user: User; first: boolean }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const ink = useInk();
  const client = useClient();
  const { bot, loading } = usePublicBot(user.id);
  const commands = botCommands(useCommands(user.id) as never, user.id, i18n.locale);
  const ownerId = (user.bot as { owner?: string } | undefined)?.owner;
  const creator = creatorShown(bot, ownerId, client.user?.id);
  // the space it will take while loading, so Roles below do not jump
  if (loading) return <View style={{ minHeight: 96 }} accessibilityElementsHidden />;
  const sections: React.ReactNode[] = [];
  if (bot) {
    const standing = botStanding(user.officialBot, bot.verified);
    const privacy = safeLink(bot.privacyPolicyUrl);
    const terms = safeLink(bot.termsOfServiceUrl);
    sections.push(
      <Section key="about" first={first && sections.length === 0} title={t`About this bot`}>
        <View testID="bot-about" style={{ gap: 4 }}>
          {standing === "official" ? (
            <Fact icon="shield-check" tone={palette.onlineText}>{t`Run by the Zrzur team.`}</Fact>
          ) : standing === "verified" ? (
            <Fact icon="seal-check" tone={palette.onlineText}>{t`Verified by Zrzur`}</Fact>
          ) : (
            <Fact icon="info">{t`Not verified by Zrzur`}</Fact>
          )}
          {bot.serverCount !== undefined ? (
            <Fact icon="users-three">{plural(bot.serverCount, { 0: "Not in any servers yet", one: "In # server", other: "In # servers" })}</Fact>
          ) : null}
        </View>
        {privacy || terms ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16 }}>
            {privacy ? (
              <Pressable accessibilityRole="link" onPress={() => void openExternal(privacy)} hitSlop={{ top: 12, bottom: 12 }} style={{ minHeight: 20, justifyContent: "center" }}>
                <AText size={13} line={20} color={ink.link}>
                  {t`Privacy policy`}
                </AText>
              </Pressable>
            ) : null}
            {terms ? (
              <Pressable accessibilityRole="link" onPress={() => void openExternal(terms)} hitSlop={{ top: 12, bottom: 12 }} style={{ minHeight: 20, justifyContent: "center" }}>
                <AText size={13} line={20} color={ink.link}>
                  {t`Terms of service`}
                </AText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Section>,
    );
  }
  if (creator) {
    const self = creator.kind === "self" ? client.user : undefined;
    const name = self ? self.displayName : creator.kind === "name" ? creator.name : "";
    sections.push(
      <Section key="creator" first={first && sections.length === 0} title={t`Created by`}>
        <Pressable
          testID="bot-creator"
          accessibilityRole={self ? "button" : "text"}
          disabled={!self}
          onPress={self ? () => openProfile(self.id) : undefined}
          style={{ alignSelf: "flex-start", minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <Avatar url={self?.animatedAvatarURL} name={name} size={24} />
          <AText size={14} line={20} weight="semibold" color={ink.ink} style={autoDirStyle(name)}>
            {name}
          </AText>
        </Pressable>
      </Section>,
    );
  }
  if (commands.length) {
    sections.push(
      <Section key="commands" first={first && sections.length === 0} title={t`Commands`}>
        <View style={{ gap: 6 }}>
          {commands.slice(0, SHOWN_COMMANDS).map((c) => (
            <View key={c.id} style={{ gap: 2 }}>
              <AText size={14} line={20} weight="semibold" color={ink.ink} style={{ writingDirection: "ltr", textAlign: "left" }}>
                {`/${c.name}`}
              </AText>
              {c.description ? (
                <AText autoDir size={13} line={18} color={ink.ink2}>
                  {c.description}
                </AText>
              ) : null}
            </View>
          ))}
        </View>
        {commands.length > SHOWN_COMMANDS ? (
          <AText size={13} line={18} color={ink.muted}>
            {t`and ${commands.length - SHOWN_COMMANDS} more — type / in a channel to see them all`}
          </AText>
        ) : null}
      </Section>,
    );
  }
  return sections.length ? <View style={{ gap: 12 }}>{sections}</View> : null;
}
