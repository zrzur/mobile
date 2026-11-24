import { useRef, useState } from "react";

import type { ButtonStatus } from "@/ui/auth/parts";

import { type AuthError, toAuthError } from "./flow";

/**
 * A form's submit state, like the web Form: ignores a second press while
 * working, keeps the server's error until the next submit.
 */
export function useSubmit() {
  const [status, setStatus] = useState<ButtonStatus>("ready");
  const [error, setError] = useState<AuthError | null>(null);
  const busy = useRef(false);

  async function run(task: () => Promise<unknown>): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setStatus("submitting");
    setError(null);
    try {
      await task();
      setStatus("success");
      setTimeout(() => setStatus("ready"), 1600);
      return true;
    } catch (err) {
      setError(toAuthError(err));
      setStatus("ready");
      return false;
    } finally {
      busy.current = false;
    }
  }

  return { status, error, setError, run };
}
