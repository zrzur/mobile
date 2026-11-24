import { needsAccount, parseDeepLink, systemPath } from "@/notifications/links";
import { rememberLink } from "@/notifications/pending";

/**
 * Links the system opens the app with:
 * - `zrzur://verify/<code>`, `zrzur://reset/<token>` and the web app's
 *   `https://app.zrzur.com/login/verify/<code>`, `/login/reset/<token>`,
 *   `/login/delete/<token>` and `/login/confirm-change/<token>` open the
 *   matching signed-out screens;
 * - invites (`https://zrzur.cc/<code>`, `…/invite/<code>`, `zrzur://invite/<code>`)
 *   open the invite's preview card; bots (`zrzur.cc/b/<id>`, `/bot/<id>`) the
 *   add-bot page; events (`/e/<path>`, `/e/join/<code>`) their page; listed
 *   servers (`/discover/<link>`) their Discover page;
 * - channels and messages (`/server/<s>/channel/<c>/<m>`, `/channel/<c>/<m>`),
 *   servers and profiles (`/friends?profile=<user>`) open their screens.
 *
 * A link for a signed-in screen is also kept, so it still opens after the
 * person signs in (the root layout sends a signed-out person to sign in).
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  const href = systemPath(path);
  const link = parseDeepLink(path);
  if (link && needsAccount(link)) rememberLink(href);
  return href;
}
