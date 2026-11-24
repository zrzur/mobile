/**
 * A style in the three places people will see it (web designs/Mirror.tsx and
 * Scenes.tsx ChatScene / MembersScene): your profile card, a conversation and
 * a member list. The same picture everywhere in Designs.
 */
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { intlLocale } from "@/chat/time";
import { useTheme } from "@/theme/ThemeProvider";
import { AText, Icon, type IconName } from "@/ui/kit";
import { Segmented } from "@/ui/search/parts";

import { type Person, useCast } from "./labels";
import {
  MemberRow,
  StyleCard,
  StyledName,
  WornAvatar,
  useWearer,
} from "./parts";
import { ART, type UserStyle } from "./style";

type Place = "profile" | "chat" | "members";

export function Mirror({
  style,
  label,
  testID = "designs-mirror",
}: {
  style: UserStyle;
  label?: string;
  testID?: string;
}) {
  const { t } = useLingui();
  const [place, setPlace] = useState<Place>("profile");
  return (
    <View testID={testID} style={{ gap: 12, minWidth: 0 }}>
      <Segmented
        label={label ?? t`Where to preview`}
        value={place}
        onChange={setPlace}
        testID="mirror-place"
        options={[
          { value: "profile", label: t`Profile` },
          { value: "chat", label: t`Chat` },
          { value: "members", label: t`Members` },
        ]}
      />
      <View
        style={{
          minHeight: 280,
          padding: 8,
          borderRadius: 14,
          backgroundColor: ART.ground,
        }}
      >
        {place === "profile" ? (
          <StyleCard style={style} feature testID="mirror-card" />
        ) : place === "chat" ? (
          <ChatScene style={style} />
        ) : (
          <MembersScene style={style} />
        )}
      </View>
    </View>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: React.ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: palette.borderSoft,
        backgroundColor: palette.frame,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: 44,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderBottomWidth: 1,
          borderBottomColor: palette.borderSoft,
          backgroundColor: palette.field,
        }}
      >
        <Icon name={icon} size={16} color={palette.muted} />
        <AText
          size={13}
          line={18}
          weight="semibold"
          color={palette.fg2}
          numberOfLines={1}
        >
          {title}
        </AText>
      </View>
      {children}
    </View>
  );
}

/** One message as it looks in a channel, wearing a style (web ChatLine) */
function ChatLine({
  style,
  person,
  time,
  children,
}: {
  style: UserStyle;
  person?: Person;
  time: string;
  children: string;
}) {
  const { palette } = useTheme();
  const wearer = useWearer();
  return (
    <View style={{ flexDirection: "row", gap: 12, minWidth: 0 }}>
      <View
        style={{
          width: 48,
          height: 48,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <WornAvatar size={40} style={style} other={person} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 8,
            minWidth: 0,
          }}
        >
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <StyledName
              text={person?.name ?? wearer.name}
              style={style}
              size={14}
              line={20}
              color={palette.fg}
            />
          </View>
          <AText size={12} line={16} color={palette.muted}>
            {time}
          </AText>
        </View>
        <AText autoDir size={14} line={20} color={palette.fg}>
          {children}
        </AText>
      </View>
    </View>
  );
}

/** Times in the sample conversation, in the app's language */
function useSampleTime() {
  const { i18n } = useLingui();
  return (minute: number) => {
    try {
      return new Intl.DateTimeFormat(intlLocale(i18n.locale), {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(2026, 0, 1, 20, minute));
    } catch {
      return `20:${minute}`;
    }
  };
}

/** What a style looks like in a conversation */
function ChatScene({ style }: { style: UserStyle }) {
  const { t } = useLingui();
  const cast = useCast();
  const time = useSampleTime();
  return (
    <Panel icon="hash" title={t`general`}>
      <View style={{ padding: 16, gap: 16 }}>
        <ChatLine style={{}} person={cast[1]} time={time(12)}>
          {t`Who is up for a match tonight?`}
        </ChatLine>
        <ChatLine style={style} time={time(14)}>
          {t`Count me in. Give me ten minutes.`}
        </ChatLine>
        <ChatLine style={{}} person={cast[2]} time={time(15)}>
          {t`Nice new look, by the way.`}
        </ChatLine>
      </View>
    </Panel>
  );
}

/** What a style looks like between other people in a member list */
function MembersScene({ style }: { style: UserStyle }) {
  const { t } = useLingui();
  const cast = useCast();
  return (
    <Panel icon="users-three" title={t`Online`}>
      <View style={{ padding: 8, gap: 4 }}>
        <MemberRow style={{}} other={cast[4]} />
        <MemberRow style={{}} other={cast[5]} />
        <MemberRow style={style} testID="mirror-member-you" />
        <MemberRow style={{}} other={cast[1]} />
        <MemberRow style={{}} other={cast[3]} />
      </View>
    </Panel>
  );
}
