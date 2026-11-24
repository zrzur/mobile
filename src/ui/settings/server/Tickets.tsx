import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { TextField } from "@/ui/auth/parts";
import { Button, Chip, Icon } from "@/ui/kit";
import { PressScale } from "@/ui/kit/Press";
import { AText } from "@/ui/kit/Text";

import { ControlRow, InlineError, SettingsSection, Toggle } from "../parts";
import { FieldLabel, PickerSheet, SelectField } from "./controls";
import { draftOf, MAX_TYPES, newTypeId, sameDraft, type TicketsDraft, type TicketsSettings, ticketsBody, toggleRole, typesReady } from "./ticketsLogic";

type Role = { id: string; name: string; colour?: string | null };

/**
 * Overview › Tickets (web: TicketsSettings): members open a private channel
 * with the server's staff. The switch saves at once; where tickets go, who
 * answers, the kinds of ticket, the entry's name and the first message are
 * saved together with Save.
 */
export function TicketsSection({ server }: { server: Server }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const manage = server.havePermission("ManageServer");
  const info = useFields(server, (s) => ({
    roles: s.orderedRoles.map((role) => ({ id: role.id, name: role.name, colour: role.colour })) as Role[],
    categories: (s.categories ?? []).map((category) => ({ id: category.id, title: category.title })),
  }));
  const [stored, setStored] = useState<TicketsSettings | null | undefined>(undefined);
  const [draft, setDraft] = useState<TicketsDraft>(draftOf(undefined));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [picking, setPicking] = useState(false);

  // the SDK does not keep `tickets` yet: read the server's own answer
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    (client.api.get(`/servers/${server.id as ""}` as never) as Promise<{ tickets?: TicketsSettings | null }>)
      .then((raw) => {
        if (!live) return;
        setStored(raw.tickets ?? null);
        setDraft(draftOf(raw.tickets));
      })
      .catch((err: unknown) => {
        if (live) setLoadError(describeError(err));
      });
    return () => {
      live = false;
    };
  }, [client, server.id, attempt]);
  const load = () => setAttempt((n) => n + 1);

  if (!info) return null;
  const on = stored?.enabled === true;
  const dirty = !sameDraft(draft, draftOf(stored));

  async function send(enabled: boolean, values: TicketsDraft) {
    if (!manage || pending) return;
    setPending(true);
    setError(undefined);
    try {
      const tickets = ticketsBody(enabled, values);
      const answer = (await client.api.patch(`/servers/${server.id as ""}` as never, { tickets } as never)) as { tickets?: TicketsSettings | null } | undefined;
      const next = answer && "tickets" in answer ? (answer.tickets ?? null) : { ...tickets };
      setStored(next);
      setDraft(draftOf(next));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  const setType = (id: string, change: Partial<TicketsDraft["types"][number]>) =>
    setDraft((now) => ({ ...now, types: now.types.map((type) => (type.id === id ? { ...type, ...change } : type)) }));

  const roleChips = (chosen: string[], toggle: (id: string) => void, prefix: string) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {info.roles.map((role) => (
        <Chip key={role.id} label={role.name} selected={chosen.includes(role.id)} disabled={!manage} onPress={() => toggle(role.id)} testID={`${prefix}-${role.id}`} />
      ))}
    </View>
  );

  const categoryName = info.categories.find((category) => category.id === draft.category)?.title ?? t`No category`;

  return (
    <SettingsSection
      title={t({ message: "Tickets", context: "server-settings" })}
      description={t`Members open a private channel with your staff.`}
      readOnly={manage ? undefined : t`Manage server`}
    >
      <View style={{ gap: 16 }}>
        <RowGroup>
          <ControlRow
            first
            icon="ticket"
            title={t`Tickets`}
            description={t`Members get an "Open a ticket" entry in the server's menu.`}
            control={<Toggle label={t`Tickets`} value={on} disabled={!manage || pending || stored === undefined} onChange={() => void send(!on, draftOf(stored))} testID="tickets-switch" />}
          />
          {on ? (
            <View style={{ borderTopWidth: 1, borderTopColor: palette.divider, paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
              <FieldLabel hint={t`Where a new ticket appears in the channel list.`}>{t`Category for new tickets`}</FieldLabel>
              <SelectField label={t`Category for new tickets`} value={categoryName} disabled={!manage} onPress={() => setPicking(true)} testID="tickets-category" />
            </View>
          ) : null}
        </RowGroup>

        {loadError ? (
          <View style={{ gap: 8, alignItems: "flex-start" }}>
            <InlineError message={loadError} />
            <Button size="sm" variant="tonal" label={t`Try again`} onPress={() => {
                setLoadError(undefined);
                load();
              }} />
          </View>
        ) : null}

        {on ? (
          <>
            <View style={{ gap: 8 }}>
              <SubTitle title={t`Who answers`} text={t`The roles that see and answer tickets.`} />
              {info.roles.length ? (
                roleChips(draft.staff_roles, (id) => setDraft((now) => ({ ...now, staff_roles: toggleRole(now.staff_roles, id) })), "tickets-staff")
              ) : (
                <AText size={13} line={18} color={palette.fg2}>
                  {t`This server has no roles yet. Until it does, only people who can see every channel answer tickets.`}
                </AText>
              )}
            </View>

            <View style={{ gap: 8 }}>
              <SubTitle
                title={t`Kinds of ticket`}
                text={t`With kinds, a member chooses one when opening a ticket, and each kind can go to roles of its own. Without any, there is one kind of ticket.`}
              />
              {draft.types.map((type, index) => (
                <View key={type.id} testID={`tickets-type-${index}`} style={{ gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.borderSubtle }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <TextField label={t`Name`} maxLength={32} editable={manage} value={type.name} placeholder={t`Support`} onChangeText={(name) => setType(type.id, { name })} />
                    </View>
                    <PressScale
                      accessibilityRole="button"
                      accessibilityLabel={t`Remove this kind`}
                      disabled={!manage}
                      scale={0.94}
                      onPress={() => setDraft((now) => ({ ...now, types: now.types.filter((one) => one.id !== type.id) }))}
                      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navHover : "transparent" })}
                    >
                      <Icon name="trash" size={18} color={palette.danger} />
                    </PressScale>
                  </View>
                  {info.roles.length ? (
                    <>
                      <AText size={12} line={16} weight="bold" color={palette.fg2}>
                        {t`Answered by (none: the roles above)`}
                      </AText>
                      {roleChips(type.staff_roles, (id) => setType(type.id, { staff_roles: toggleRole(type.staff_roles, id) }), `tickets-type-${index}-role`)}
                    </>
                  ) : null}
                </View>
              ))}
              {draft.types.length < MAX_TYPES ? (
                <View style={{ alignItems: "flex-start" }}>
                  <Button
                    size="sm"
                    variant="tonal"
                    icon="plus"
                    label={t`Add a kind`}
                    disabled={!manage}
                    testID="tickets-add-type"
                    onPress={() => setDraft((now) => ({ ...now, types: [...now.types, { id: newTypeId(), name: "", staff_roles: [] }] }))}
                  />
                </View>
              ) : null}
            </View>

            <View style={{ gap: 8 }}>
              <SubTitle title={t`Name of the entry`} text={t`What members see in the server's menu. Empty: "Open a ticket".`} />
              <TextField
                label={t`Name of the entry`}
                maxLength={32}
                editable={manage}
                value={draft.label}
                placeholder={t`Open a ticket`}
                testID="tickets-label"
                onChangeText={(label) => setDraft((now) => ({ ...now, label }))}
              />
            </View>

            <View style={{ gap: 8 }}>
              <SubTitle title={t`First message in a ticket`} />
              <TextField
                label={t`First message in a ticket`}
                multiline
                maxLength={500}
                editable={manage}
                value={draft.message}
                placeholder={t`Tell us what you need and we will answer here.`}
                helper={`${draft.message.length}/500`}
                style={{ minHeight: 80, textAlignVertical: "top" }}
                onChangeText={(message) => setDraft((now) => ({ ...now, message }))}
              />
            </View>

            {dirty ? (
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="ghost" label={t`Reset`} disabled={pending} onPress={() => setDraft(draftOf(stored))} />
                <Button label={t`Save`} status={pending ? "submitting" : "ready"} disabled={!typesReady(draft)} testID="tickets-save" onPress={() => void send(true, draft)} />
              </View>
            ) : null}
          </>
        ) : null}

        <AText size={13} line={18} color={palette.fg2}>
          {t`A ticket is a private channel: only the member who opened it, the roles you pick and the people who see every channel can read it.`}
        </AText>
        <InlineError message={error} />
      </View>

      <PickerSheet
        visible={picking}
        title={t`Category for new tickets`}
        value={draft.category || "none"}
        options={[{ value: "none", label: t`No category` }, ...info.categories.map((category) => ({ value: category.id, label: category.title }))]}
        onPick={(value) => setDraft((now) => ({ ...now, category: value === "none" ? "" : value }))}
        onClose={() => setPicking(false)}
        testID="tickets-category-sheet"
      />
    </SettingsSection>
  );
}

/** A sub-heading inside the section (web: a SettingsSection title and description) */
function SubTitle({ title, text }: { title: string; text?: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <AText size={13} line={20} weight="semibold" color={palette.fg}>
        {title}
      </AText>
      {text ? (
        <AText size={13} line={20} color={palette.fg2}>
          {text}
        </AText>
      ) : null}
    </View>
  );
}
