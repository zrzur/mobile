import { useLingui } from "@lingui/react/macro";
import type { MFA, MFATicket } from "@zrzur/sdk/solid";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { SheetModal } from "@/ui/kit/Sheet";
import { GroupRow, RowGroup } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";

import { type MfaMethod, firstMethod, mfaBody } from "./accountLogic";

/**
 * iOS can't show a new modal while the last one is still animating away.
 * Callers that close their own sheet before asking for a ticket pass
 * `afterSheet`, and the flow waits this long before (and after) its dialog.
 */
export const SHEET_SWAP_MS = Platform.OS === "ios" ? 420 : 80;

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type DialogAction = {
  label: string;
  onPress: () => void;
  /** primary = pink-red fill, danger = the danger fill, tonal = quiet */
  kind?: "primary" | "danger" | "tonal";
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
};

/**
 * The web Dialog on a phone: a bottom sheet with an icon, title, text, the
 * body, an error line, then its buttons (main one first). Every dismissal
 * (scrim, Back) calls `onClose`.
 */
export function DialogSheet({
  visible,
  onClose,
  icon,
  title,
  text,
  error,
  actions,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  icon?: IconName;
  title: string;
  text?: string;
  error?: string | null;
  actions: DialogAction[];
  children?: ReactNode;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <SheetModal visible={visible} onClose={onClose} testID={testID} handleOnly maxShare={0.88} panelStyle={{ paddingTop: 24 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" bounces={false}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {icon ? <Icon name={icon} size={24} color={palette.iconNeutral} /> : null}
                <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header" style={{ flex: 1 }}>
                  {title}
                </AText>
              </View>
              {error ? (
                <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
                  <Icon name="warning-circle" size={16} color={palette.danger} />
                  <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
                    {error}
                  </AText>
                </View>
              ) : null}
              {text ? (
                <AText size={15} line={22} color={palette.fg2}>
                  {text}
                </AText>
              ) : null}
              {children}
              <View style={{ gap: 8 }}>
                {actions.map((a) => (
                  <DialogButton key={a.label} action={a} />
                ))}
              </View>
            </ScrollView>
    </SheetModal>
  );
}

/** One dialog button: the kit Button (44 px, radius 10, 15/600), full width */
function DialogButton({ action }: { action: DialogAction }) {
  return (
    <Button
      testID={action.testID}
      label={action.label}
      onPress={action.onPress}
      variant={action.kind ?? "tonal"}
      disabled={action.disabled}
      status={action.busy ? "submitting" : "ready"}
      fill
    />
  );
}

type Request = {
  /** an MFA status already loaded (skips GET /auth/mfa/) */
  mfa?: MFA;
  /** the caller just closed its own sheet: wait for it to go away first */
  afterSheet?: boolean;
};

type Pending = { resolve: (ticket: MFATicket | undefined) => void; mfa: MFA };

/**
 * The web `mfaFlow`: asks for the password, an authenticator code or a
 * recovery code, and gives back a single-use ticket (PUT /auth/mfa/ticket).
 * `request()` resolves with `undefined` when the person cancels. Render
 * `element` once in the page; never call `request()` while another sheet of
 * the page is open (close it first and pass `afterSheet`).
 */
export function useMfaTicket(): { request: (options?: Request) => Promise<MFATicket | undefined>; element: ReactNode } {
  const client = useClient();
  const pending = useRef<Pending | null>(null);
  // null = closed; methods empty = still loading
  const [open, setOpen] = useState<{ methods: MfaMethod[]; method?: MfaMethod } | null>(null);

  const finish = useCallback((ticket: MFATicket | undefined) => {
    const p = pending.current;
    pending.current = null;
    setOpen(null);
    // let the dialog go away before the caller opens its next sheet
    if (p) setTimeout(() => p.resolve(ticket), SHEET_SWAP_MS);
  }, []);

  const request = useCallback(
    async (options?: Request) => {
      if (options?.afterSheet) await wait(SHEET_SWAP_MS);
      pending.current?.resolve(undefined);
      pending.current = null;
      setOpen({ methods: [] });
      let mfa: MFA;
      try {
        mfa = options?.mfa ?? (await client.account.mfa());
      } catch (err) {
        setOpen(null);
        await wait(SHEET_SWAP_MS);
        throw err;
      }
      const methods = mfa.availableMethods as MfaMethod[];
      return new Promise<MFATicket | undefined>((resolve) => {
        pending.current = { resolve, mfa };
        setOpen({ methods, method: firstMethod(methods) ?? (methods.length === 1 ? methods[0] : undefined) });
      });
    },
    [client],
  );

  // a page that goes away mid-flow cancels it
  useEffect(
    () => () => {
      pending.current?.resolve(undefined);
      pending.current = null;
    },
    [],
  );

  const createTicket = useCallback(async (method: MfaMethod, value: string) => {
    const p = pending.current;
    if (!p) return;
    const ticket = await p.mfa.createTicket(mfaBody(method, value));
    finish(ticket);
  }, [finish]);

  const element = (
    <MfaDialog
      open={open}
      onPick={(method) => setOpen((o) => (o ? { ...o, method } : o))}
      onCancel={() => finish(undefined)}
      onConfirm={createTicket}
    />
  );
  return { request, element };
}

const METHOD_ICON: Record<MfaMethod, IconName> = { Password: "password", Totp: "device-mobile", Recovery: "key" };

/** Dialog "Confirm action" (web MFAFlowModal) */
function MfaDialog({
  open,
  onPick,
  onCancel,
  onConfirm,
}: {
  open: { methods: MfaMethod[]; method?: MfaMethod } | null;
  onPick: (method: MfaMethod | undefined) => void;
  onCancel: () => void;
  onConfirm: (method: MfaMethod, value: string) => Promise<void>;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labels: Record<MfaMethod, string> = { Password: t`Password`, Totp: t`Authenticator app`, Recovery: t`Recovery code` };
  const methods = open?.methods ?? [];
  const method = open?.method;
  const loading = !!open && methods.length === 0;
  const single = methods.length === 1;

  const clear = () => {
    setValue("");
    setError(null);
    setBusy(false);
  };
  const cancel = () => {
    clear();
    onCancel();
  };
  const pick = (m: MfaMethod | undefined) => {
    // switching method clears the field
    setValue("");
    setError(null);
    onPick(m);
  };
  const submit = async () => {
    if (!method || !value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(method, value);
      clear();
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  const actions: DialogAction[] = loading
    ? [{ label: t`Cancel`, onPress: cancel, testID: "mfa-cancel" }]
    : method
      ? [
          { label: t`Confirm`, onPress: submit, kind: "primary", disabled: !value, busy, testID: "mfa-confirm" },
          single
            ? { label: t`Cancel`, onPress: cancel, testID: "mfa-cancel" }
            : { label: t`Back`, onPress: () => pick(undefined), testID: "mfa-back" },
        ]
      : [{ label: t`Cancel`, onPress: cancel, testID: "mfa-cancel" }];

  return (
    <DialogSheet
      visible={!!open}
      onClose={cancel}
      icon="shield"
      title={t`Confirm action`}
      error={error}
      text={loading ? undefined : method ? t`Please confirm this action using the selected method.` : t`Please select a method to authenticate your request.`}
      actions={actions}
      testID="mfa-dialog"
    >
      {loading ? (
        <ActivityIndicator color={palette.muted} style={{ paddingVertical: 16 }} />
      ) : method ? (
        <TextField
          key={method}
          label={labels[method]}
          value={value}
          onChangeText={(v) => {
            setValue(v);
            setError(null);
          }}
          password={method === "Password"}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete={method === "Password" ? "current-password" : method === "Totp" ? "one-time-code" : "off"}
          textContentType={method === "Password" ? "password" : method === "Totp" ? "oneTimeCode" : "none"}
          keyboardType={method === "Totp" ? "number-pad" : "default"}
          returnKeyType="done"
          onSubmitEditing={submit}
          testID="mfa-field"
        />
      ) : (
        <RowGroup>
          {methods.map((m, i) => (
            <GroupRow key={m} first={i === 0} testID={`mfa-method-${m}`} icon={METHOD_ICON[m]} label={labels[m]} onPress={() => pick(m)} chevron />
          ))}
        </RowGroup>
      )}
    </DialogSheet>
  );
}
