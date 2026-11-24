import { useEffect, useState } from "react";

import { useClient } from "@/client/ClientProvider";
import { useFields, useServer } from "@/client/hooks";
import { secureStorage } from "@/lib/secureStorage";

import { InterestsSheet } from "./InterestsSheet";
import { interestsKey, shouldAskInterests } from "./onboardingLogic";

/** Servers whose interests window was already offered this session */
const askedInterests = new Set<string>();

/**
 * First visit of a server: ask the role questions once, before anything
 * else (web: ServerSidebar's interests effect). Mount it on the server's
 * channel list screen; it renders nothing unless it asks.
 */
export function ServerFirstOpen({ serverId }: { serverId: string }) {
  const client = useClient();
  const server = useServer(serverId);
  const [open, setOpen] = useState(false);
  const f = useFields(server, (s) => ({
    roles: s.member ? [...s.member.roles] : undefined,
    questions: (s.lobby?.onboarding ?? []).map((q) => ({ options: (q.options ?? []).map((o) => ({ role: o.role ?? "" })) })),
  }));
  const userId = client.user?.id;
  const roles = f?.roles;
  const questions = f?.questions;
  const ready = !!roles && !!userId;

  useEffect(() => {
    if (!ready || askedInterests.has(serverId)) return;
    // nothing to ask: no need to read the device storage
    if (!shouldAskInterests(questions, roles!, false)) return;
    let live = true;
    secureStorage
      .get(interestsKey(serverId, userId!))
      .catch(() => null)
      .then((stored) => {
        if (!live || askedInterests.has(serverId)) return;
        if (shouldAskInterests(questions, roles!, !!stored)) {
          askedInterests.add(serverId);
          setOpen(true);
        }
      });
    return () => {
      live = false;
    };
  }, [ready, serverId, userId, questions, roles]);

  if (!server || !open) return null;
  return <InterestsSheet server={server} visible={open} onClose={() => setOpen(false)} />;
}
