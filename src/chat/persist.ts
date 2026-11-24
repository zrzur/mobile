import { File, Paths } from "expo-file-system";

/**
 * Small JSON files in the app's own documents folder, for data that is too
 * big for the keychain (drafts, recent emoji, trusted link sites). Reads
 * once, writes after a short pause so typing never waits on the disk.
 */
export function jsonFile<T>(name: string, clean: (raw: unknown) => T) {
  let file: File | undefined;
  const handle = () => (file ??= new File(Paths.document, name));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: T | undefined;

  return {
    /** The saved value, or `clean(undefined)` when there is none */
    async read(): Promise<T> {
      try {
        const f = handle();
        if (!f.exists) return clean(undefined);
        return clean(JSON.parse(await f.text()));
      } catch {
        return clean(undefined);
      }
    },
    /** Save soon (the last value within `delay` wins) */
    write(value: T, delay = 400) {
      pending = value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        const next = pending;
        pending = undefined;
        try {
          const f = handle();
          if (!f.exists) f.create();
          void f.write(JSON.stringify(next)).catch(() => {});
        } catch {
          // the value just won't persist this time
        }
      }, delay);
    },
  };
}
