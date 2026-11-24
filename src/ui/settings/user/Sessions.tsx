import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { RowGroup } from "@/ui/app/parts";
import { TextField } from "@/ui/auth/parts";

import { DialogSheet, SHEET_SWAP_MS, useMfaTicket, wait } from "../MfaFlow";
import { SettingsPage } from "../parts";
import { EmptyRow, LoadError, Loading, NavRow, Note, useLoad } from "./profile-parts";
import { type ListedSession, byLastUsed, isAlreadyClosed, readLastUsed, relativeTime, sessionIcon, sessionTitle } from "./sessions-logic";

type Row = { id: string; name: string; createdAt: number; lastUsed?: number; current: boolean };

/** Who the sign-out dialog is for: this device, one other session, or all others */
type SignOut = { kind: "current" } | { kind: "one"; row: Row } | { kind: "all" };

/** Sessions (web settings › Sessions) */
export function SessionsPage() {
  const { t, i18n } = useLingui();
  const client = useClient();
  const { signOut } = useAuth();
  const mfa = useMfaTicket();

  const [open, setOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Row | null>(null);
  const [name, setName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState<SignOut | null>(null);
  const [outBusy, setOutBusy] = useState(false);
  const [outError, setOutError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    const list = await client.api.raw<ListedSession[]>("get", "/auth/session/all");
    // keep the SDK's collection in step (rename/delete go through it)
    for (const s of list) client.sessions.getOrCreate(s._id, s as never);
    const lastUsed = readLastUsed(list);
    const rows: Row[] = list.map((s) => {
      const session = client.sessions.get(s._id);
      return {
        id: s._id,
        name: s.name ?? "",
        createdAt: session ? session.createdAt.getTime() : 0,
        lastUsed: lastUsed.get(s._id),
        current: s._id === client.sessionId,
      };
    });
    return { rows, now: Date.now() };
  }, [client]);
  const loaded = useLoad(fetchRows);
  const rows = loaded.data?.rows ?? null;
  const now = loaded.data?.now ?? 0;
  const error = loaded.data ? null : loaded.error;
  const load = loaded.reload;
  const setRows = (fn: (rows: Row[] | null) => Row[] | null) => loaded.update((d) => (d ? { ...d, rows: fn(d.rows) ?? [] } : d));

  const current = rows?.find((r) => r.current);
  const others = rows ? byLastUsed(rows.filter((r) => !r.current), new Map(rows.map((r) => [r.id, r.lastUsed]))) : [];

  const describe = (row: Row) => {
    if (row.lastUsed) {
      const time = relativeTime(row.lastUsed, now, i18n.locale);
      return t`Last used ${time}`;
    }
    const time = relativeTime(row.createdAt, now, i18n.locale);
    return t`Created ${time}`;
  };

  const startRename = (row: Row) => {
    setName(row.name);
    setRenameError(null);
    setRenaming(row);
  };

  const rename = async () => {
    if (!renaming || !name.trim()) return;
    setRenameBusy(true);
    setRenameError(null);
    try {
      const session = client.sessions.get(renaming.id);
      if (session) await session.rename(name.trim());
      else await client.api.raw("patch", `/auth/session/${renaming.id}`, { friendly_name: name.trim() });
      const id = renaming.id;
      const next = name.trim();
      setRows((list) => list?.map((r) => (r.id === id ? { ...r, name: next } : r)) ?? list);
      setRenaming(null);
    } catch (err) {
      setRenameError(describeError(err));
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmSignOut = async () => {
    const target = signingOut;
    if (!target) return;
    setOutError(null);
    if (target.kind === "current") {
      setOutBusy(true);
      // signOut ignores an already-ended session (InvalidSession)
      await signOut();
      return;
    }
    // one sheet at a time: close this dialog, ask for the ticket, then act
    setSigningOut(null);
    let ticket;
    try {
      ticket = await mfa.request({ afterSheet: true });
    } catch (err) {
      setOutError(describeError(err));
      setSigningOut(target);
      return;
    }
    if (!ticket) return;
    try {
      if (target.kind === "one") {
        const session = client.sessions.get(target.row.id);
        try {
          if (session) await session.delete(ticket);
          else await client.api.raw("delete", `/auth/session/${target.row.id}`, undefined, { headers: { "X-MFA-Ticket": ticket.token } });
        } catch (err) {
          if (!isAlreadyClosed(err)) throw err;
          client.sessions.delete(target.row.id);
        }
        const id = target.row.id;
        setRows((list) => list?.filter((r) => r.id !== id) ?? list);
      } else {
        await client.sessions.deleteAll(ticket);
        setRows((list) => list?.filter((r) => r.current) ?? list);
      }
      setOpen(null);
    } catch (err) {
      setOutError(describeError(err));
      await wait(SHEET_SWAP_MS);
      setSigningOut(target);
    }
  };

  const outTitle =
    signingOut?.kind === "current"
      ? t`Log out of this device?`
      : signingOut?.kind === "one"
        ? (() => {
            const sessionName = sessionTitle(signingOut.row.name);
            return t`Log out of ${sessionName}?`;
          })()
        : t`Log out of all other sessions?`;
  const outText =
    signingOut?.kind === "current" ? t`You will need to sign in again.` : signingOut?.kind === "one" ? t`That device will need to sign in again.` : t`This device stays signed in.`;

  const children = (row: Row) => (
    <>
      <NavRow title={t`Rename`} icon="pencil-simple" onPress={() => startRename(row)} testID={`session-rename-${row.current ? "current" : row.id}`} />
      <NavRow
        title={t`Log out`}
        icon="sign-out"
        danger
        onPress={() => {
          setOutError(null);
          setSigningOut(row.current ? { kind: "current" } : { kind: "one", row });
        }}
        testID={`session-logout-${row.current ? "current" : row.id}`}
      />
    </>
  );

  return (
    <SettingsPage title={t`Sessions`} testID="settings-sessions">
      {error ? (
        <LoadError title={t`We could not load your sessions.`} error={error} onRetry={() => void load()} testID="sessions-error" />
      ) : !rows ? (
        <Loading testID="sessions-loading" />
      ) : (
        <View style={{ gap: 16 }}>
          <Note>{t`Devices signed in to your account. Unused ones log out by themselves.`}</Note>
          <RowGroup>
            <NavRow
              first
              icon={sessionIcon(current?.name)}
              title={t`This device`}
              description={current ? sessionTitle(current.name) : undefined}
              expanded={open === "current"}
              onPress={() => setOpen(open === "current" ? null : "current")}
              testID="session-current"
            />
            {open === "current" && current ? children(current) : null}
            {others.length ? (
              <NavRow
                icon="sign-out"
                title={t`Log out other sessions`}
                description={t`Logs you out of all sessions except this device.`}
                onPress={() => {
                  setOutError(null);
                  setSigningOut({ kind: "all" });
                }}
                testID="sessions-logout-others"
              />
            ) : null}
          </RowGroup>
          <RowGroup>
            {others.length ? (
              others.map((row, i) => (
                <View key={row.id}>
                  <NavRow
                    first={i === 0}
                    icon={sessionIcon(row.name)}
                    title={sessionTitle(row.name)}
                    description={describe(row)}
                    expanded={open === row.id}
                    onPress={() => setOpen(open === row.id ? null : row.id)}
                    testID={`session-${row.id}`}
                  />
                  {open === row.id ? children(row) : null}
                </View>
              ))
            ) : (
              <EmptyRow>{t`No other device is signed in.`}</EmptyRow>
            )}
          </RowGroup>
        </View>
      )}

      <DialogSheet
        visible={!!renaming}
        onClose={() => setRenaming(null)}
        icon="pencil-simple"
        title={t`Rename session`}
        error={renameError}
        testID="rename-session-dialog"
        actions={[
          { label: t`Rename`, kind: "primary", onPress: () => void rename(), disabled: !name.trim(), busy: renameBusy, testID: "rename-session-save" },
          { label: t`Cancel`, onPress: () => setRenaming(null) },
        ]}
      >
        <TextField label={t`Name`} placeholder={t`Enter a new name for this session`} value={name} onChangeText={setName} onSubmitEditing={() => void rename()} testID="rename-session-name" />
      </DialogSheet>

      <DialogSheet
        visible={!!signingOut}
        onClose={() => setSigningOut(null)}
        icon="sign-out"
        title={outTitle}
        text={outText}
        error={outError}
        testID="sign-out-dialog"
        actions={[
          { label: t`Log out`, kind: "danger", onPress: () => void confirmSignOut(), busy: outBusy, testID: "sign-out-confirm" },
          { label: t`Cancel`, onPress: () => setSigningOut(null) },
        ]}
      />
      {mfa.element}
    </SettingsPage>
  );
}
