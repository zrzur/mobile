import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import { type SoundLibrary, type SoundLibrarySound, type SoundboardSound, addLibrarySound, createSound, deleteSound, fetchSoundLibrary, fetchSoundboard, searchSoundLibrary, soundLibraryName, soundLibraryPreviewUrl } from "@zrzur/sdk/solid/voiceExtras";
import { type AudioPlayer, createAudioPlayer } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { intlLocale } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { claimPlayback, prepareAudio } from "@/media/playback";
import { type Emitter, useSdkEvent } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup, SearchField } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit";

import { InlineError, SettingsPage, SettingsSection, SmallButton } from "../parts";
import { DEFAULT_SOUND_BYTES, LIBRARY_PAGE, MAX_SOUND_MS, SOUND_EMOJI_MAX, SOUND_NAME_MAX, type SoundProblem, applySoundEvent, isFull, isSingleEmoji, kilobytes, nameFromFile, seconds, soundProblem, soundsLeft } from "../soundboard";
import { EmptyCard, LoadError, Loading, PickerSheet, SelectField } from "./controls";

type Picked = { uri: string; name: string; type: string; size?: number };

/** Length of a sound file on this device, in whole ms; `null` when it can't be read */
function measureDuration(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    let player: AudioPlayer | undefined;
    let done = false;
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      try {
        player?.remove();
      } catch {
        // already gone
      }
      resolve(value);
    };
    const check = () => {
      if (player?.isLoaded && Number.isFinite(player.duration) && player.duration > 0) finish(Math.round(player.duration * 1000));
    };
    const poll = setInterval(check, 100);
    const timer = setTimeout(() => finish(null), 6000);
    try {
      player = createAudioPlayer(uri);
      player.addListener("playbackStatusUpdate", check);
    } catch {
      finish(null);
    }
  });
}

/** A round 44 px icon button (listen, remove) */
function RoundButton({ icon, label, onPress, color, testID, disabled }: { icon: IconName; label: string; onPress: () => void; color?: string; testID?: string; disabled?: boolean }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.5 : 1, backgroundColor: pressed ? palette.navSelected : "transparent" })}
    >
      <Icon name={icon} size={20} color={color ?? palette.iconNeutral} />
    </Pressable>
  );
}

/** A sound row: glyph, name, length, then the controls */
function SoundRow({ glyph, name, detail, first, children }: { glyph?: string | null; name: string; detail: string; first?: boolean; children?: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 4, paddingStart: 16, paddingEnd: 4, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider }}>
      <View style={{ width: 28, alignItems: "center" }}>{glyph ? <AText size={20} line={26} color={palette.fg}>{glyph}</AText> : <Icon name="music-note" size={20} color={palette.iconNeutral} />}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <AText autoDir size={16} line={22} weight="medium" color={palette.fg} numberOfLines={1}>
          {name}
        </AText>
        <AText size={13} line={18} color={palette.muted}>
          {detail}
        </AText>
      </View>
      {children}
    </View>
  );
}

/** Soundboard (web: server soundboard settings) */
export function SoundboardPage({ server }: { server: Server }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const locale = intlLocale(i18n.locale);
  const manage = server.havePermission("ManageSoundboard");

  const [list, setList] = useState<SoundboardSound[] | null>(null);
  const [limit, setLimit] = useState<number>();
  const [loadError, setLoadError] = useState<string>();
  const [mode, setMode] = useState<"upload" | "library">("upload");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  // upload form
  const [file, setFile] = useState<Picked | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [problem, setProblem] = useState<SoundProblem>();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");

  // library
  const [library, setLibrary] = useState<SoundLibrary | null>(null);
  const [libraryError, setLibraryError] = useState<string>();
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(LIBRARY_PAGE);
  const [categoryPicker, setCategoryPicker] = useState(false);
  const [adding, setAdding] = useState<{ id: string; name: string } | null>(null);

  // one sound plays at a time, on this device only
  const player = useRef<AudioPlayer | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchSoundboard(client, server)
      .then((r) => {
        if (!live) return;
        setList(r.sounds);
        setLimit(r.limit || undefined);
      })
      .catch((err) => live && setLoadError(describeError(err)));
    // the library is small and cached per client: load it ahead of the tab
    fetchSoundLibrary(client)
      .then((l) => live && setLibrary(l))
      .catch((err) => live && setLibraryError(describeError(err)));
    return () => {
      live = false;
    };
  }, [client, server]);

  useEffect(
    () => () => {
      try {
        player.current?.remove();
      } catch {
        // already gone
      }
      player.current = null;
    },
    [],
  );

  useSdkEvent(client as unknown as Emitter<{ voiceEvent: [event: { type: string; server?: string }] }>, "voiceEvent", (event) => {
    setList((l) => (l ? applySoundEvent(l, event as never, server.id) : l));
  });

  const stop = () => {
    try {
      player.current?.remove();
    } catch {
      // already gone
    }
    player.current = null;
    setPlaying(null);
  };

  const listen = (key: string, uri: string, volume: number) => {
    const again = playing === key;
    stop();
    if (again) return;
    try {
      const p = createAudioPlayer(uri);
      p.volume = Math.min(1, Math.max(0, volume));
      p.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish && player.current === p) stop();
      });
      player.current = p;
      setPlaying(key);
      // one sound at a time: a note or video playing stops for the preview
      const release = claimPlayback(() => {
        if (player.current === p) stop();
      });
      p.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) release();
      });
      void prepareAudio("play").then(() => p.play());
    } catch {
      setPlaying(null);
    }
  };

  const count = list?.length ?? 0;
  const full = isFull(limit, count);
  const maxBytes = client.limits?.file_upload_size_limits?.sounds ?? DEFAULT_SOUND_BYTES;
  const kb = kilobytes(maxBytes);
  const max = seconds(MAX_SOUND_MS, locale);
  const emojiOk = isSingleEmoji(emoji);
  const canAdd = emojiOk && !!file && !!duration && !problem && !!name.trim() && !busy && !full;
  const mediaUrl = client.configuration?.features?.autumn?.url?.replace(/\/$/, "");

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav"], copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.length) return;
    const a = result.assets[0];
    const picked: Picked = { uri: a.uri, name: a.name, type: a.mimeType ?? "", size: a.size };
    setError(undefined);
    setFile(picked);
    setDuration(null);
    const early = soundProblem(picked, maxBytes);
    if (early) return setProblem(early);
    setProblem(undefined);
    if (!name.trim()) setName(nameFromFile(a.name));
    const ms = await measureDuration(a.uri);
    const late = soundProblem(picked, maxBytes, ms);
    setProblem(late);
    if (!late) setDuration(ms);
  };

  const add = async () => {
    if (!canAdd || !file || !duration) return;
    setBusy(true);
    setError(undefined);
    try {
      const id = await client.uploadFile("sounds", { uri: file.uri, name: file.name, type: file.type || "audio/mpeg" } as unknown as File);
      const sound = await createSound(client, server, id, { name: name.trim(), duration_ms: duration, ...(emoji.trim() ? { emoji: emoji.trim() } : {}) });
      setList((l) => (l && !l.some((s) => s._id === sound._id) ? [...l, sound] : l));
      setFile(null);
      setDuration(null);
      setName("");
      setEmoji("");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const addFromLibrary = async () => {
    if (!adding || !adding.name.trim() || busy || full) return;
    setBusy(true);
    setError(undefined);
    try {
      const sound = await addLibrarySound(client, server, adding.id, { name: adding.name.trim() });
      setList((l) => (l && !l.some((s) => s._id === sound._id) ? [...l, sound] : l));
      setAdding(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await deleteSound(client, server, id);
      setList((l) => (l ? l.filter((s) => s._id !== id) : l));
      setRemoving(null);
      if (playing === id) stop();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const problemText: Record<SoundProblem, string> = {
    type: t`Pick an MP3, OGG or WAV file.`,
    size: t`This file is too big. Sounds can be up to ${kb} KB.`,
    length: t`This sound is too long. Sounds can be up to ${max} seconds.`,
    unreadable: t`This file can't be played as a sound.`,
  };
  const hint = error ?? (problem ? problemText[problem] : !emojiOk ? t`Use a single emoji.` : full ? t`The soundboard is full. Remove a sound, or add Wings to the server for more.` : t`An MP3, OGG or WAV file of up to ${kb} KB, then a name. WAV files are big: longer sounds fit as MP3 or OGG.`);
  const hintIsProblem = !!error || !!problem || !emojiOk;

  const left = soundsLeft(limit, count);
  const description = left !== undefined && limit ? t`${left} of ${limit} sounds left. Up to ${max} seconds each.` : t`Short sounds members play in voice calls.`;
  const readOnly = manage ? undefined : t`Manage soundboard`;
  const added = new Set((list ?? []).map((s) => s.library_id).filter(Boolean));

  const results = library ? searchSoundLibrary(library, { category: category || undefined, query, locale: i18n.locale }) : [];
  const categories = [{ value: "", label: t`All sounds` }, ...(library?.categories ?? []).map((c) => ({ value: c.id, label: soundLibraryName(c.names, i18n.locale) }))];
  const libraryRow = (s: SoundLibrarySound, i: number) => {
    const label = soundLibraryName(s.names, i18n.locale);
    const secs = seconds(s.duration_ms, locale);
    const key = `library:${s.id}`;
    const open = adding?.id === s.id;
    return (
      <View key={s.id}>
        <SoundRow first={i === 0} glyph={s.emoji} name={label} detail={t`${secs} s`}>
          <RoundButton icon={playing === key ? "speaker-high" : "play"} label={t`Listen to ${label}`} onPress={() => listen(key, soundLibraryPreviewUrl(client, s), 1)} testID={`library-listen-${s.id}`} />
          {added.has(s.id) ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12 }}>
              <Icon name="check-circle" size={16} color={palette.onlineText} />
              <AText size={14} line={20} color={palette.fg2}>
                {t`Added`}
              </AText>
            </View>
          ) : !open ? (
            <SmallButton label={t`Add`} disabled={full || busy} testID={`library-add-${s.id}`} onPress={() => setAdding({ id: s.id, name: [...label].slice(0, SOUND_NAME_MAX).join("") })} />
          ) : null}
        </SoundRow>
        {open && adding ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
            <TextField label={t`Name`} value={adding.name} maxLength={SOUND_NAME_MAX} helper={`${[...adding.name].length}/${SOUND_NAME_MAX}`} onChangeText={(v) => setAdding({ id: s.id, name: v })} testID="library-name" />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <SmallButton label={t`Cancel`} onPress={() => setAdding(null)} />
              <SmallButton label={t`Add sound`} primary disabled={busy || !adding.name.trim() || full} testID="library-add-confirm" onPress={() => void addFromLibrary()} />
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SettingsPage title={t`Soundboard`} description={t`Short sounds members play in voice calls.`} testID="server-soundboard">
      <SettingsSection title={t`Add a sound`} description={description} readOnly={readOnly}>
        <View style={{ gap: 16 }}>
          <View accessibilityRole="radiogroup" accessibilityLabel={t`Where the sound comes from`} style={{ flexDirection: "row", padding: 4, gap: 4, borderRadius: 12, backgroundColor: palette.field }}>
            {(
              [
                ["upload", t`Upload`, "upload-simple"],
                ["library", t`Library`, "music-note"],
              ] as const
            ).map(([value, label, icon]) => {
              const on = mode === value;
              return (
                <Pressable
                  key={value}
                  testID={`soundboard-mode-${value}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  aria-checked={on}
                  onPress={() => setMode(value)}
                  style={{ flex: 1, minHeight: 44, borderRadius: 10, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: on ? palette.tonal : "transparent" }}
                >
                  <Icon name={icon} size={18} color={on ? palette.fg : palette.fg2} />
                  <AText size={14} line={20} weight="semibold" color={on ? palette.fg : palette.fg2}>
                    {label}
                  </AText>
                </Pressable>
              );
            })}
          </View>

          {mode === "upload" ? (
            <View style={{ gap: 16 }} testID="soundboard-upload">
              <Pressable
                testID="soundboard-pick"
                accessibilityRole="button"
                disabled={full || busy}
                onPress={() => void pick()}
                style={({ pressed }) => ({ minHeight: 44, borderRadius: 10, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8, opacity: full || busy ? 0.5 : 1, borderWidth: 1, borderColor: palette.tonalBorder, backgroundColor: pressed ? palette.tonalHover : palette.tonal })}
              >
                <Icon name="upload-simple" size={18} color={palette.fg} />
                <AText autoDir size={15} line={20} weight="semibold" color={palette.fg} numberOfLines={1} style={{ flex: 1 }}>
                  {file?.name ?? t`Choose a sound`}
                </AText>
              </Pressable>
              <TextField label={t`Name`} value={name} onChangeText={setName} maxLength={SOUND_NAME_MAX} helper={`${[...name].length}/${SOUND_NAME_MAX}`} testID="soundboard-name" />
              <TextField label={t`Emoji (optional)`} value={emoji} onChangeText={setEmoji} maxLength={SOUND_EMOJI_MAX} testID="soundboard-emoji" />
              <AText size={13} line={18} color={hintIsProblem ? palette.danger : palette.muted} accessibilityRole={hintIsProblem ? "alert" : undefined} testID="soundboard-hint">
                {hint}
              </AText>
              <View style={{ alignSelf: "flex-end" }}>
                <SmallButton label={busy ? t`Uploading…` : t`Add sound`} primary disabled={!canAdd} testID="soundboard-add" onPress={() => void add()} />
              </View>
            </View>
          ) : (
            <View style={{ gap: 12 }} testID="soundboard-library">
              <AText size={14} line={20} color={palette.fg2}>
                {t`Ready-made sounds, free for everyone (CC0, from Kenney). Listen, then add the ones you like.`}
              </AText>
              <View style={{ gap: 8 }}>
                <AText size={13} line={20} weight="semibold" color={palette.fg2}>
                  {t`Category`}
                </AText>
                <SelectField testID="library-category" label={t`Category`} value={categories.find((c) => c.value === category)?.label ?? t`All sounds`} onPress={() => setCategoryPicker(true)} />
              </View>
              <View style={{ flexDirection: "row" }}>
                <SearchField
                  value={query}
                  onChange={(v) => {
                    setQuery(v);
                    setShown(LIBRARY_PAGE);
                  }}
                  placeholder={t`Search sounds`}
                  testID="library-search"
                />
              </View>
              {full ? (
                <AText size={13} line={18} color={palette.muted}>
                  {t`The soundboard is full. Remove a sound, or add Wings to the server for more.`}
                </AText>
              ) : null}
              <InlineError message={error} />
              {libraryError ? (
                <InlineError message={libraryError} />
              ) : !library ? (
                <Loading />
              ) : results.length === 0 ? (
                <EmptyCard icon="magnifying-glass" title={t`No sounds match your search.`} />
              ) : (
                <>
                  <RowGroup>{results.slice(0, shown).map(libraryRow)}</RowGroup>
                  {results.length > shown ? (
                    <View style={{ alignSelf: "center" }}>
                      <SmallButton label={t`Show more`} testID="library-more" onPress={() => setShown((n) => n + LIBRARY_PAGE)} />
                    </View>
                  ) : null}
                </>
              )}
            </View>
          )}
        </View>
      </SettingsSection>

      <SettingsSection title={t`Sounds`} readOnly={readOnly}>
        {loadError ? (
          <LoadError text={loadError} />
        ) : !list ? (
          <Loading />
        ) : list.length === 0 ? (
          <EmptyCard icon="music-note" title={t`No sounds yet.`} />
        ) : (
          <View testID="soundboard-list">
            <RowGroup>
              {list.map((s, i) => {
                const soundName = s.name;
                const secs = seconds(s.duration_ms, locale);
                const asking = removing === s._id;
                return (
                  <SoundRow key={s._id} first={i === 0} glyph={s.emoji && !/^[0-9A-Z]{26}$/.test(s.emoji) ? s.emoji : null} name={soundName} detail={t`${secs} s`}>
                    {asking ? (
                      <View style={{ flexDirection: "row", gap: 8, paddingEnd: 8 }}>
                        <Button testID={`sound-remove-confirm-${s._id}`} label={t`Remove`} variant="danger" size="sm" disabled={busy} onPress={() => void remove(s._id)} />
                        <SmallButton label={t`Cancel`} onPress={() => setRemoving(null)} />
                      </View>
                    ) : (
                      <>
                        {mediaUrl ? (
                          <RoundButton icon={playing === s._id ? "speaker-high" : "play"} label={t`Listen to ${soundName}`} testID={`sound-listen-${s._id}`} onPress={() => listen(s._id, `${mediaUrl}/sounds/${s._id}/original`, (s.volume ?? 100) / 100)} />
                        ) : null}
                        <RoundButton icon="trash" label={t`Remove ${soundName}`} color={palette.danger} testID={`sound-remove-${s._id}`} onPress={() => setRemoving(s._id)} />
                      </>
                    )}
                  </SoundRow>
                );
              })}
            </RowGroup>
          </View>
        )}
      </SettingsSection>

      <PickerSheet
        visible={categoryPicker}
        title={t`Category`}
        value={category}
        options={categories}
        onPick={(v) => {
          setCategory(v);
          setShown(LIBRARY_PAGE);
        }}
        onClose={() => setCategoryPicker(false)}
      />
    </SettingsPage>
  );
}

