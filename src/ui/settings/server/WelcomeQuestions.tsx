import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import { useCallback, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { ulid } from "ulid";

import { inputDirStyle } from "@/ui/kit/bidi";
import { describeError } from "@/auth/errorText";
import { useSolid } from "@/sdk/bridge";
import { fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { Sheet } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

import { RowTool as IconButton } from "./controls";
import { eligibleRoles, isOrdinary, lobbyWithQuestions, MAX_ANSWERS, MAX_QUESTIONS, move, type QuestionRole, questionsOf, questionsProblem, type RoleQuestion, sameQuestions } from "../lobby";
import { editServer } from "@/ui/server/serverEdit";

const HEX = /^#[0-9a-f]{6}$/i;

/** State of the Welcome questions form; the Joining page bar saves it (model B) */
export function useWelcomeQuestions(server: Server) {
  const { t } = useLingui();
  const storedJson = useSolid(useCallback(() => JSON.stringify(server.lobby?.onboarding ?? []), [server]));
  const stored = useMemo(() => questionsOf(JSON.parse(storedJson)), [storedJson]);
  const roleJson = useSolid(
    useCallback(
      () =>
        JSON.stringify(
          // permission bits stay out of the snapshot: only a boolean goes in
          server.orderedRoles.map((r) => ({ id: r.id, name: r.name, colour: r.colour, rank: r.rank, managed: r.isManaged, ordinary: isOrdinary(r.permissions.a) })),
        ),
      [server],
    ),
  );
  const roles = useMemo(() => JSON.parse(roleJson) as QuestionRole[], [roleJson]);
  const owner = useSolid(useCallback(() => !!server.owner?.self, [server]));
  const myRank = useSolid(useCallback(() => server.member?.ranking ?? Infinity, [server]));
  const [draft, setDraft] = useState<RoleQuestion[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [showErrors, setShowErrors] = useState(false);

  const list = draft ?? stored;
  const dirty = !!draft && !sameQuestions(draft, stored);
  const roleIds = useMemo(() => new Set(roles.map((r) => r.id)), [roles]);
  const check = questionsProblem(list, roleIds);

  const reset = () => {
    setDraft(null);
    setError(undefined);
    setShowErrors(false);
  };
  const save = async () => {
    if (check.invalid) {
      setShowErrors(true);
      setError(t`Complete every role question and choose a role for each answer.`);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await editServer(server, (s) => ({ lobby: lobbyWithQuestions(s.lobby, list) }));
      setDraft(null);
      setShowErrors(false);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  return {
    list,
    set: (next: RoleQuestion[]) => {
      setDraft(next);
      if (error && !showErrors) setError(undefined);
    },
    dirty,
    saving,
    error,
    errors: showErrors ? check.errors : undefined,
    eligible: eligibleRoles(roles, owner, myRank),
    roles,
    reset,
    save,
  };
}

export type WelcomeQuestionsState = ReturnType<typeof useWelcomeQuestions>;

function Dot({ colour }: { colour?: string }) {
  const { palette } = useTheme();
  return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colour && HEX.test(colour) ? colour : palette.pill }} />;
}

/** Welcome questions (web: RoleQuestions + LobbyRoleQuestionsEditor) */
export function WelcomeQuestions({ server, state }: { server: Server; state: WelcomeQuestionsState }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const canEdit = server.havePermission("AssignRoles");
  const { list, set, errors, eligible, roles } = state;
  const disabled = !canEdit || state.saving;
  const [picking, setPicking] = useState<{ q: string; o: string } | null>(null);

  const editQuestion = (id: string, patch: Partial<RoleQuestion>) => set(list.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const editOption = (qid: string, oid: string, patch: Partial<RoleQuestion["options"][number]>) =>
    set(list.map((q) => (q.id === qid ? { ...q, options: q.options.map((o) => (o.id === oid ? { ...o, ...patch } : o)) } : q)));

  const pickedQuestion = picking ? list.find((q) => q.id === picking.q) : undefined;
  const pickedRole = pickedQuestion?.options.find((o) => o.id === picking?.o)?.role ?? "";

  return (
    <View style={{ gap: 12 }} testID="welcome-questions">
      <View style={{ gap: 4 }}>
        <AText size={16} line={22} weight="semibold" color={palette.header}>
          {t`Roles by interest`}
        </AText>
        <AText size={13} line={18} color={palette.muted}>
          {t`New members answer these in a window when they first open the server, and get each answer's role right away. They can skip it and change their answers later from the server menu.`}
        </AText>
      </View>
      <View style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
        <Icon name="info" size={20} color={palette.iconMuted} />
        <AText size={13} line={18} color={palette.fg2} style={{ flex: 1 }}>
          {t`Only ordinary member roles can be offered: no managed roles and none with moderation or admin permissions.`}
        </AText>
      </View>
      {!canEdit ? (
        <View accessibilityRole="text" accessibilityLiveRegion="polite" style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field, borderWidth: 1, borderColor: palette.warningText }}>
          <Icon name="warning" size={20} color={palette.warningText} />
          <AText size={13} line={18} color={palette.fg} style={{ flex: 1 }}>
            {t`You need Assign Roles permission to change these questions.`}
          </AText>
        </View>
      ) : null}

      <View style={{ gap: 12, opacity: canEdit ? 1 : 0.6 }} pointerEvents={canEdit ? "auto" : "none"}>
        {list.map((q, qi) => {
          const n = qi + 1;
          return (
            <View key={q.id} testID={`role-question-${qi}`} style={{ gap: 12, padding: 16, paddingTop: 8, borderRadius: 14, backgroundColor: palette.field }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginEnd: -12 }}>
                <AText size={13} line={18} weight="bold" color={palette.fg2} style={{ flex: 1 }}>
                  {t`Question ${n}`}
                </AText>
                <IconButton icon="caret-up" label={t`Move up`} disabled={disabled || qi === 0} onPress={() => set(move(list, qi, qi - 1))} />
                <IconButton icon="caret-down" label={t`Move down`} disabled={disabled || qi === list.length - 1} onPress={() => set(move(list, qi, qi + 1))} />
                <IconButton icon="trash" label={t`Remove question`} disabled={disabled} onPress={() => set(list.filter((x) => x.id !== q.id))} />
              </View>
              <TextField
                label={t`Question`}
                value={q.question}
                maxLength={150}
                placeholder={t`What brings you here?`}
                editable={!disabled}
                error={errors?.question[q.id] ? t`Write the question.` : undefined}
                onChangeText={(v) => editQuestion(q.id, { question: v })}
                testID={`role-question-text-${qi}`}
              />
              <TextField
                label={t`Description`}
                value={q.description ?? ""}
                maxLength={500}
                placeholder={t`Optional: one line under the question.`}
                editable={!disabled}
                onChangeText={(v) => editQuestion(q.id, { description: v || undefined })}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <AText size={13} line={20} weight="semibold" color={palette.fg2} style={{ flex: 1 }}>
                  {t`Answers`}
                </AText>
                <AText size={13} line={20} weight="semibold" color={palette.fg2} style={{ flex: 1 }}>
                  {t`Role it gives`}
                </AText>
              </View>
              {q.options.map((o, oi) => {
                const a = oi + 1;
                const role = roles.find((r) => r.id === o.role);
                const usable = eligible.some((r) => r.id === o.role);
                const labelError = errors?.label[o.id];
                const roleError = errors?.role[o.id];
                return (
                  <View key={o.id} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TextInput
                        accessibilityLabel={t`Answer ${a}`}
                        aria-invalid={!!labelError}
                        value={o.label}
                        maxLength={80}
                        placeholder={t`Gaming`}
                        placeholderTextColor={palette.muted}
                        editable={!disabled}
                        onChangeText={(v) => editOption(q.id, o.id, { label: v })}
                        style={{ flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: palette.frame, borderWidth: 1, borderColor: labelError ? palette.danger : palette.fieldBorder, color: palette.fg, fontSize: 16, lineHeight: 20, fontFamily: fontFamily(i18n.locale), ...inputDirStyle(o.label) }}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t`Role for answer ${a}`}
                        aria-invalid={!!roleError}
                        disabled={disabled}
                        onPress={() => setPicking({ q: q.id, o: o.id })}
                        style={{ flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: palette.frame, borderWidth: 1, borderColor: roleError ? palette.danger : palette.fieldBorder, flexDirection: "row", alignItems: "center", gap: 8 }}
                      >
                        {role && usable ? <Dot colour={role.colour} /> : null}
                        <AText size={15} line={20} color={role ? palette.fg : palette.muted} numberOfLines={1} style={{ flex: 1 }}>
                          {!o.role ? t`Choose a role` : role && usable ? role.name : t`Role unavailable`}
                        </AText>
                        <Icon name="caret-down" size={14} color={palette.iconMuted} />
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginEnd: -12 }}>
                      {labelError || roleError ? (
                        <AText size={12} line={16} color={palette.danger} style={{ flex: 1 }} accessibilityRole="alert">
                          {labelError ? t`Write the answer.` : t`Choose the role this answer gives.`}
                        </AText>
                      ) : null}
                      <IconButton icon="caret-up" label={t`Move answer ${a} up`} disabled={disabled || oi === 0} onPress={() => editQuestion(q.id, { options: move(q.options, oi, oi - 1) })} />
                      <IconButton icon="caret-down" label={t`Move answer ${a} down`} disabled={disabled || oi === q.options.length - 1} onPress={() => editQuestion(q.id, { options: move(q.options, oi, oi + 1) })} />
                      <IconButton icon="trash" label={t`Remove answer`} disabled={disabled || q.options.length <= 1} onPress={() => editQuestion(q.id, { options: q.options.filter((x) => x.id !== o.id) })} />
                    </View>
                  </View>
                );
              })}
              {q.options.length < MAX_ANSWERS ? (
                <AddButton label={t`Add an answer`} disabled={disabled} onPress={() => editQuestion(q.id, { options: [...q.options, { id: ulid(), label: "", role: "" }] })} testID={`add-answer-${qi}`} />
              ) : null}
            </View>
          );
        })}
        {list.length < MAX_QUESTIONS ? (
          <View style={{ gap: 8 }}>
            <AddButton
              label={t`Add a role question`}
              disabled={disabled}
              testID="add-role-question"
              onPress={() => set([...list, { id: ulid(), question: "", options: [{ id: ulid(), label: "", role: "" }] }])}
            />
            <AText size={13} line={18} color={palette.muted}>
              {t`Up to five questions with up to eight answers each.`}
            </AText>
          </View>
        ) : null}
      </View>

      <Sheet visible={!!picking} onClose={() => setPicking(null)} testID="role-question-picker">
        <AText size={16} line={22} weight="semibold" color={palette.header}>
          {t`Role it gives`}
        </AText>
        <View style={{ borderRadius: 14, backgroundColor: palette.field, overflow: "hidden" }}>
          {[{ id: "", name: t`Choose a role`, colour: undefined as string | undefined }, ...eligible].map((r, i) => {
            const on = r.id === pickedRole;
            return (
              <Pressable
                key={r.id || "none"}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                onPress={() => {
                  if (picking) editOption(picking.q, picking.o, { role: r.id });
                  setPicking(null);
                }}
                style={({ pressed }) => ({ minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider, backgroundColor: pressed ? palette.navSelected : "transparent" })}
              >
                {r.id ? <Dot colour={r.colour} /> : null}
                <AText size={16} line={22} weight={on ? "semibold" : "medium"} color={r.id ? palette.fg : palette.muted} style={{ flex: 1 }}>
                  {r.name}
                </AText>
                {on ? <Icon name="check-circle" size={20} color={palette.accentText} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

/** Dashed "add" button (web: AddButton) */
export function AddButton({ label, onPress, disabled, testID }: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: palette.borderStrong, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: disabled ? 0.5 : 1, backgroundColor: pressed ? palette.navHover : "transparent" })}
    >
      <Icon name="plus" size={18} color={palette.fg2} />
      <AText size={14} line={20} weight="semibold" color={palette.fg2}>
        {label}
      </AText>
    </Pressable>
  );
}
