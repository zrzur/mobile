import { type ServerMember, type User, UserProfile } from "@zrzur/sdk/solid";
import { useCallback, useEffect, useState } from "react";

import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";

/** One public GitHub repository (web linkedServices) */
export type LinkedRepo = { id: number; name: string; description?: string; language?: string; stars: number; url: string };

/** A linked account as another person sees it */
export type ProfileConnection = {
  service: "twitch" | "github" | "battlenet";
  display_name: string;
  profile_url: string;
  live?: boolean;
  live_title?: string;
  repos?: LinkedRepo[];
  followers?: number;
  public_repos?: number;
  kind?: string;
  game?: string;
};

/** Games of a linked Steam account */
export type ProfileGames = {
  service: string;
  display_name: string;
  profile_url: string;
  private: boolean;
  game_count?: number;
  total_hours?: number;
  games: { appid: number; name: string; hours: number }[];
};

export type FullProfile = {
  content?: string;
  bannerURL?: string;
  links: string[];
  sections?: string[];
  creator: boolean;
  games?: ProfileGames;
  connections: ProfileConnection[];
};

/** The person, from the cache or fetched once when unknown */
export function useTargetUser(userId: string): User | undefined {
  const client = useClient();
  const user = useSolid(useCallback(() => client.users.get(userId), [client, userId]));
  useEffect(() => {
    if (user) return;
    client.users.fetch(userId).catch(() => {});
  }, [client, user, userId]);
  return user;
}

/** Their membership of a server, fetched once when not in the cache */
export function useTargetMember(serverId: string | undefined, userId: string): ServerMember | undefined {
  const client = useClient();
  const member = useSolid(useCallback(() => (serverId ? client.serverMembers.getByKey({ server: serverId, user: userId }) : undefined), [client, serverId, userId]));
  useEffect(() => {
    if (member || !serverId) return;
    const server = client.servers.get(serverId);
    server?.fetchMember(userId).catch(() => {});
  }, [client, member, serverId, userId]);
  return member;
}

type Load = { state: "loading" | "error" | "ready"; data?: FullProfile };

/** The profile with its games and linked accounts, in one request (web fetchFullProfile) */
export function useFullProfile(userId: string, exists: boolean): Load & { reload: () => void } {
  const client = useClient();
  const [load, setLoad] = useState<Load & { for?: string }>({ state: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!exists) return;
    let alive = true;
    client.api
      .raw<ConstructorParameters<typeof UserProfile>[1] & { games?: ProfileGames; connections?: ProfileConnection[] }>("get" as never, `/users/${userId}/profile`)
      .then((data) => {
        if (!alive) return;
        const profile = new UserProfile(client, data);
        setLoad({
          for: userId,
          state: "ready",
          data: {
            content: profile.content,
            bannerURL: profile.animatedBannerURL ?? profile.bannerURL,
            links: profile.links ?? [],
            sections: profile.sections,
            creator: !!profile.creator,
            games: data.games,
            connections: data.connections ?? [],
          },
        });
      })
      .catch(() => alive && setLoad({ for: userId, state: "error" }));
    return () => {
      alive = false;
    };
  }, [client, userId, exists, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  // a new person shows loading, not the last one's profile
  return load.for === userId ? { ...load, reload } : { state: "loading", reload };
}
