import { forwardRef, useImperativeHandle } from "react";

import type { CaptchaHandle } from "./Captcha";

export type { CaptchaHandle } from "./Captcha";

/**
 * The web preview is for design checks only: Turnstile's site key does not
 * accept a localhost page, so the box only says where the check runs.
 */
export const Captcha = forwardRef<
  CaptchaHandle,
  { siteKey: string; onToken: (token: string | null) => void; onError: () => void }
>(function Captcha({ onToken }, ref) {
  useImperativeHandle(ref, () => ({ reset: () => onToken(null) }));
  return null;
});
