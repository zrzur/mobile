import { useLingui } from "@lingui/react/macro";
import { File as SdkFile } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { type ReactNode, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { type EdgeInsets, SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { Chip } from "@/ui/kit/Chip";
import { GestureRoot } from "@/ui/kit/GestureRoot";
import { KeyboardSafeScreen, keyboardScrollProps } from "@/ui/kit/keyboard";
import { confirmDiscard } from "@/ui/kit/leaveGuard";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useServer } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { HeaderButton, RowGroup } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { Choices, ControlRow, Toggle } from "@/ui/settings/parts";

import {
  createBody,
  DEFAULT_REMINDERS,
  editBody,
  EVENT_TEMPLATES,
  type EventTemplate,
  eventTimeProblem,
  MAX_REMINDERS,
  MAX_SEATS,
  REMINDER_CHOICES,
  reminderSpan,
  roundUp,
  seatCount,
  toggleReminder,
} from "./eventFormat";
import { DateTimeField } from "./DateTimeField";
import { createEvent, editEvent } from "./eventsStore";
import type { AttendeeList, EventPlace, EventRepeat, ServerEvent } from "./types";

type PlaceKind = EventPlace["type"];
type Repeat = EventRepeat | "None";


function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
          {title}
        </AText>
        {description ? (
          <AText size={14} line={20} color={palette.muted}>
            {description}
          </AText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * The editor's own safe area. On iPhone the editor is a native sheet with a
 * safe area of its own (measured by its own provider, so the header never
 * sits under the status bar however the sheet is shown); an Android Modal
 * measures zero inside, so it takes the app's insets.
 */
function Framed({ insets: given, children }: { insets?: EdgeInsets; children: (insets: EdgeInsets) => ReactNode }) {
  const own = useSafeAreaInsets();
  return <>{children(given ?? own)}</>;
}

/**
 * Schedule a server event, or change one (web: ServerEventEditorModal):
 * title, description, when, where, repeat, cover, who sees it, seats and
 * reminders. Mistakes show here, in plain words, without losing anything.
 */
export function EventEditor({ serverId, event: existing, onClose }: { serverId: string; event?: ServerEvent; onClose: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const server = useServer(serverId);
  const [initialStart] = useState(() => (existing ? new Date(existing.starts_at) : roundUp(new Date(Date.now() + 60 * 60_000), 30)));
  const [start, setStart] = useState<Date>(initialStart);
  const [hasEnd, setHasEnd] = useState(!!existing?.ends_at || !existing);
  const [end, setEnd] = useState<Date>(existing?.ends_at ? new Date(existing.ends_at) : new Date(initialStart.getTime() + 2 * 60 * 60_000));
  const [kind, setKind] = useState<PlaceKind>(existing?.place.type ?? "Voice");
  const [channel, setChannel] = useState(existing && existing.place.type !== "External" ? existing.place.channel : "");
  const [location, setLocation] = useState(existing?.place.type === "External" ? existing.place.location : "");
  const [repeat, setRepeat] = useState<Repeat>(existing?.repeat ?? "None");
  const invitedOnly = existing?.visibility === "Invited";
  const [visibility, setVisibility] = useState<"Place" | "Roles">(existing?.visibility === "Roles" ? "Roles" : "Place");
  const [roles, setRoles] = useState<string[]>(existing?.visible_roles ?? []);
  const [limited, setLimited] = useState(existing?.capacity != null);
  const [seats, setSeats] = useState(String(existing?.capacity ?? 20));
  const [waitlist, setWaitlist] = useState(existing?.waitlist !== false);
  const [attendeeList, setAttendeeList] = useState<AttendeeList>(existing?.attendee_list ?? "Organisers");
  const [reminders, setReminders] = useState<number[]>(existing ? (existing.reminders ?? []) : DEFAULT_REMINDERS);
  const [template, setTemplate] = useState<string>("blank");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [cover, setCover] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const rootInsets = useSafeAreaInsets();
  const ios = Platform.OS === "ios";
  const [now] = useState(() => new Date());
  // something typed or picked that closing would lose
  const dirty =
    !saving &&
    (title !== (existing?.title ?? "") || description !== (existing?.description ?? "") || !!cover || coverRemoved || location !== (existing?.place.type === "External" ? existing.place.location : ""));
  const close = () => (dirty ? confirmDiscard(onClose) : onClose());

  const channels = (server?.channels ?? []).filter((c) => c.havePermission("ViewChannel") && (kind === "Voice" ? c.isVoice : !c.isVoice)).map((c) => ({ id: c.id, name: c.name }));
  const chosenChannel = channels.some((c) => c.id === channel) ? channel : (channels[0]?.id ?? "");
  const roleList = (server?.orderedRoles ?? []).map((r) => ({ id: r.id, name: r.name, colour: r.colour }));
  const storedCover = existing?.cover && !coverRemoved ? new SdkFile(client, existing.cover as never).createFileURL() : undefined;
  const coverUri = cover?.uri ?? storedCover;

  const templateText = (id: EventTemplate["id"]): [string, string] => {
    switch (id) {
      case "game-night":
        return [t`Game night`, t`We play together in voice. Bring a game you like, or join the one that is running.`];
      case "tournament":
        return [t`Tournament`, t`Sign up with Going to take a place. The rules and the brackets come before the start.`];
      case "watch-party":
        return [t`Watch party`, t`We watch together and talk about it in voice. Come a few minutes early.`];
      case "questions":
        return [t`Questions and answers`, t`Ask anything. Write your questions in the channel before the start.`];
      case "hangout":
        return [t`Voice hangout`, t`No plan. Drop in and talk.`];
    }
  };

  const applyTemplate = (id: string) => {
    setTemplate(id);
    const chosen = EVENT_TEMPLATES.find((e) => e.id === id);
    if (!chosen) return;
    const [name, text] = templateText(chosen.id);
    setTitle(name);
    setDescription(text);
    setKind(chosen.place);
    setRepeat(chosen.repeat ?? "None");
    setHasEnd(true);
    setEnd(new Date(start.getTime() + chosen.hours * 60 * 60_000));
    setLimited(chosen.seats !== undefined);
    if (chosen.seats !== undefined) setSeats(String(chosen.seats));
  };

  const problemText = (code?: string) => {
    switch (code) {
      case "start-missing":
        return t`Choose when it starts.`;
      case "start-past":
        return t`The start time has passed. Choose a later time.`;
      case "end-before":
        return t`The end must be after the start.`;
      case "end-long":
        return t`An event can last up to 31 days.`;
      case "place":
        return t`Choose where it takes place.`;
      case "roles":
        return t`Choose at least one role that sees this event.`;
      case "seats":
        return t`The seat limit is a number from 1 to ${MAX_SEATS}.`;
      case "title":
        return t`Please fill in this field.`;
    }
  };

  const pickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [16, 9], quality: 0.9 });
    const a = result.assets?.[0];
    if (result.canceled || !a) return;
    setCover({ uri: a.uri, name: a.fileName ?? "cover.jpg", type: a.mimeType ?? "image/jpeg" });
    setCoverRemoved(false);
  };

  const save = async (draft: boolean) => {
    if (saving) return;
    setError(undefined);
    const endsAt = hasEnd ? end : undefined;
    const startChanged = !existing || start.toISOString() !== new Date(existing.starts_at).toISOString();
    const where: EventPlace | undefined = kind === "External" ? (location.trim() ? { type: "External", location: location.trim() } : undefined) : chosenChannel ? { type: kind, channel: chosenChannel } : undefined;
    const found = !title.trim()
      ? "title"
      : (eventTimeProblem(start, endsAt, new Date(), startChanged) ??
        (!where ? "place" : !invitedOnly && visibility === "Roles" && !roles.length ? "roles" : limited && seatCount(seats) === undefined ? "seats" : undefined));
    setProblem(found);
    if (found || !where) return;
    setSaving(true);
    try {
      const coverId = cover ? await client.uploadFile("banners", cover as unknown as File) : undefined;
      const d = {
        title,
        description,
        start,
        end: endsAt,
        place: where,
        repeat: repeat === "None" ? undefined : repeat,
        visibility,
        roles,
        attendeeList,
        seats: limited ? seatCount(seats) : undefined,
        waitlist,
        reminders,
        cover: coverId,
        removeCover: coverRemoved,
      };
      if (existing) {
        await editEvent(client, serverId, existing._id, editBody(d, existing));
        onClose();
      } else {
        const created = await createEvent(client, serverId, createBody(d, Intl.DateTimeFormat().resolvedOptions().timeZone, draft));
        onClose();
        router.push({ pathname: "/event/[id]", params: { id: created._id, server: serverId } });
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const footerButton = (label: string, onPress: () => void, kindOf: "primary" | "secondary" | "text", testID: string) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={saving}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: kindOf === "text" ? 0 : 1,
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 6,
        backgroundColor: kindOf === "primary" ? (pressed ? palette.accentPressed : palette.accent) : kindOf === "secondary" ? (pressed ? palette.tonalHover : palette.tonal) : "transparent",
      })}
    >
      {saving && kindOf === "primary" ? <ActivityIndicator size="small" color={palette.onAccent} /> : null}
      <AText size={15} line={20} weight="semibold" color={kindOf === "primary" ? palette.onAccent : palette.fg}>
        {label}
      </AText>
    </Pressable>
  );

  return (
    // a task: iOS shows a sheet card (swipe down closes it unless something
    // was typed), Android slides a full screen up; a Modal is its own root,
    // so the safe area is applied by hand (a SafeAreaView inside an Android
    // Modal measured zero and the header sat under the status bar)
    <Modal
      visible
      animationType="slide"
      presentationStyle={ios ? "pageSheet" : "fullScreen"}
      allowSwipeDismissal={!dirty}
      onRequestClose={close}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <GestureRoot>
      {(() => {
        const body = (insets: EdgeInsets) => (
      <View
        testID="server-event-editor"
        style={{ flex: 1, backgroundColor: palette.frame, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}
      >
        <KeyboardSafeScreen inset={insets.bottom}>
          <View style={{ height: 64, paddingTop: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: palette.borderSubtle }}>
            <AText size={16} line={20} weight="semibold" color={palette.header} style={{ flex: 1 }} accessibilityRole="header">
              {existing ? t`Edit event` : t`New event`}
            </AText>
            <HeaderButton icon="x" label={t`Close`} onPress={close} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 32 }} {...keyboardScrollProps}>
            <Section title={t`Details`}>
              {!existing ? (
                <Choices
                  label={t`Start from`}
                  value={template}
                  onChange={(id) => (id === "blank" ? setTemplate("blank") : applyTemplate(id))}
                  options={[{ value: "blank", title: t`An empty event` }, ...EVENT_TEMPLATES.map((e) => ({ value: e.id as string, title: templateText(e.id)[0] }))]}
                />
              ) : null}
              <TextField testID="server-event-title" label={t({ message: "Title", context: "scheduled events" })} value={title} onChangeText={setTitle} maxLength={100} error={problem === "title" ? problemText("title") : undefined} />
              <TextField label={t`Description (optional)`} helper={t`Markdown works here.`} value={description} onChangeText={setDescription} maxLength={1000} multiline />
            </Section>

            <Section title={t({ message: "Time", context: "event editor" })}>
              <DateTimeField
                label={t`Starts`}
                value={start}
                min={existing?.status === "Active" ? undefined : now}
                testID="server-event-start"
                onChange={(value) => {
                  // keep the length when the start moves
                  const length = end.getTime() - start.getTime();
                  setStart(value);
                  if (length > 0) setEnd(new Date(value.getTime() + length));
                }}
              />
              {hasEnd ? <DateTimeField label={t({ message: "Ends", context: "scheduled events" })} value={end} min={start} testID="server-event-end" onChange={setEnd} /> : null}
              <RowGroup>
                <ControlRow
                  first
                  title={t`Set an end time`}
                  description={hasEnd ? undefined : t`Without an end time it ends 12 hours after it starts, or when a manager ends it.`}
                  control={<Toggle testID="server-event-has-end" label={t`Set an end time`} value={hasEnd} onChange={setHasEnd} />}
                />
              </RowGroup>
              <Choices
                label={t({ message: "Repeat", context: "scheduled events" })}
                value={repeat}
                onChange={setRepeat}
                options={[
                  { value: "None", title: t`Does not repeat` },
                  { value: "Daily", title: t`Every day` },
                  { value: "Weekly", title: t`Every week` },
                  { value: "EveryTwoWeeks", title: t`Every 2 weeks` },
                  { value: "Monthly", title: t`Every month` },
                ]}
              />
            </Section>

            <Section title={t({ message: "Where", context: "scheduled events" })}>
              <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                <Chip radio label={t`Voice channel`} selected={kind === "Voice"} onPress={() => setKind("Voice")} />
                <Chip radio label={t`Text channel`} selected={kind === "Text"} onPress={() => setKind("Text")} />
                <Chip radio label={t`Somewhere else`} selected={kind === "External"} onPress={() => setKind("External")} />
              </View>
              {kind === "External" ? (
                <TextField testID="server-event-location" label={t`Address or link`} value={location} onChangeText={setLocation} maxLength={100} />
              ) : channels.length ? (
                <RowGroup>
                  {channels.map((c, i) => (
                    <Pressable
                      key={c.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: chosenChannel === c.id }}
                      onPress={() => setChannel(c.id)}
                      style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider, backgroundColor: pressed ? palette.navSelected : "transparent" })}
                    >
                      <Icon name={kind === "Voice" ? "speaker-high" : "hash"} size={18} color={palette.iconNeutral} />
                      <AText autoDir size={16} line={22} color={palette.fg} numberOfLines={1} style={{ flex: 1 }}>
                        {c.name}
                      </AText>
                      {chosenChannel === c.id ? <Icon name="check-circle" size={18} color={palette.accentText} /> : null}
                    </Pressable>
                  ))}
                </RowGroup>
              ) : (
                <AText size={14} line={20} color={palette.fg2}>
                  {kind === "Voice" ? t`This server has no voice channel you can see.` : t`This server has no text channel you can see.`}
                </AText>
              )}
            </Section>

            <Section title={t`Cover`} description={t`Upload a picture of your own; it is cropped to 16:9. The ready covers are there if you have none.`}>
              <Pressable
                testID="server-event-cover-preview"
                accessibilityRole="button"
                accessibilityLabel={coverUri ? t`Change the cover` : t`Upload a cover picture`}
                onPress={() => void pickCover()}
                style={{ aspectRatio: 16 / 9, borderRadius: 14, overflow: "hidden", backgroundColor: palette.field, alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {coverUri ? (
                  <Image source={{ uri: coverUri }} style={{ position: "absolute", inset: 0 }} contentFit="cover" />
                ) : (
                  <>
                    <Icon name="image" size={28} color={palette.muted} />
                    <AText size={14} line={20} color={palette.muted}>
                      {t`No cover yet`}
                    </AText>
                  </>
                )}
              </Pressable>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {footerButton(coverUri ? t`Change picture` : t`Upload a picture`, () => void pickCover(), "secondary", "server-event-cover-upload")}
                {coverUri
                  ? footerButton(
                      t`Remove`,
                      () => {
                        setCover(null);
                        setCoverRemoved(true);
                      },
                      "text",
                      "server-event-cover-remove",
                    )
                  : null}
              </View>
            </Section>

            <Section title={t`Who sees it`}>
              {invitedOnly ? (
                <AText size={14} line={20} color={palette.fg2}>
                  {t`Only the invited people see this event.`}
                </AText>
              ) : (
                <>
                  <Choices
                    value={visibility}
                    onChange={setVisibility}
                    options={[
                      { value: "Place", title: t`Everyone who sees its place`, text: t`Members who can open the channel.` },
                      { value: "Roles", title: t`Some roles`, text: t`The roles you choose, and the organisers.` },
                    ]}
                  />
                  {visibility === "Roles" ? (
                    <RowGroup>
                      {roleList.map((r, i) => {
                        const on = roles.includes(r.id);
                        return (
                          <Pressable
                            key={r.id}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                            onPress={() => setRoles(on ? roles.filter((x) => x !== r.id) : [...roles, r.id])}
                            style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider, backgroundColor: pressed ? palette.navSelected : "transparent" })}
                          >
                            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: r.colour && /^#[0-9a-f]{3,8}$/i.test(r.colour) ? r.colour : palette.muted }} />
                            <AText autoDir size={16} line={22} color={palette.fg} numberOfLines={1} style={{ flex: 1 }}>
                              {r.name}
                            </AText>
                            <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: on ? "transparent" : palette.borderStrong, backgroundColor: on ? palette.accent : palette.field, alignItems: "center", justifyContent: "center" }}>
                              {on ? <Icon name="check" size={14} color={palette.onAccent} /> : null}
                            </View>
                          </Pressable>
                        );
                      })}
                    </RowGroup>
                  ) : null}
                </>
              )}
              <Choices
                label={t`Who sees the names of the people coming`}
                value={attendeeList}
                onChange={setAttendeeList}
                options={[
                  { value: "Organisers", title: t`Organisers only` },
                  { value: "Participants", title: t`People taking part` },
                  { value: "Everyone", title: t`Everyone who sees the event` },
                ]}
              />
            </Section>

            <Section title={t`Seats`}>
              <RowGroup>
                <ControlRow first title={t`Seat limit`} description={t`After it, people join a waiting list in order.`} control={<Toggle testID="server-event-limited" label={t`Seat limit`} value={limited} onChange={setLimited} />} />
                {limited ? <ControlRow title={t`Waiting list`} control={<Toggle testID="server-event-waitlist" label={t`Waiting list`} value={waitlist} onChange={setWaitlist} />} /> : null}
              </RowGroup>
              {limited ? <TextField testID="server-event-seats" label={t`Seats`} value={seats} onChangeText={(v) => setSeats(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" maxLength={5} /> : null}
            </Section>

            <Section title={t`Remind the people who are coming`} description={t`Up to 3. Each person can switch reminders off for themselves.`}>
              <RowGroup>
                {REMINDER_CHOICES.map((minutes, i) => {
                  const on = reminders.includes(minutes);
                  const full = !on && reminders.length >= MAX_REMINDERS;
                  const span = reminderSpan(minutes, i18n.locale);
                  return (
                    <View key={minutes} testID={`server-event-reminder-${minutes}`} style={{ opacity: full ? 0.5 : 1 }}>
                      <ControlRow first={i === 0} title={t`${span} before`} control={<Toggle label={t`${span} before`} value={on} disabled={full} onChange={(v) => setReminders(toggleReminder(reminders, minutes, v))} />} />
                    </View>
                  );
                })}
              </RowGroup>
            </Section>

            {problem && problem !== "title" ? (
              <View testID="server-event-problem" accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
                <Icon name="warning-circle" size={18} color={palette.danger} />
                <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
                  {problemText(problem) ?? ""}
                </AText>
              </View>
            ) : null}
            {error ? (
              <View testID="server-event-error" accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
                <Icon name="warning-circle" size={18} color={palette.danger} />
                <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
                  {error}
                </AText>
              </View>
            ) : null}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: palette.borderSubtle }}>
            {footerButton(t`Cancel`, close, "text", "server-event-cancel")}
            {!existing ? footerButton(t({ message: "Save draft", context: "event editor" }), () => void save(true), "secondary", "server-event-draft") : null}
            {footerButton(existing ? t`Save` : t({ message: "Publish", context: "scheduled events" }), () => void save(false), "primary", "server-event-publish")}
          </View>
        </KeyboardSafeScreen>
      </View>
        );
        return ios ? (
          <SafeAreaProvider style={{ flex: 1, backgroundColor: palette.frame }}>
            <Framed>{body}</Framed>
          </SafeAreaProvider>
        ) : (
          <Framed insets={rootInsets}>{body}</Framed>
        );
      })()}
      </GestureRoot>
    </Modal>
  );
}
