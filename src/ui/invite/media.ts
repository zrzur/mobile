import { useClient } from "@/client/ClientProvider";

/** A file the API describes (only its id is needed here) */
export type ApiFile = { _id: string } | null | undefined;

/** The address of an uploaded file on the media server (`{cdn}/{tag}/{id}`) */
export function fileUrl(cdn: string | undefined, tag: "icons" | "banners" | "avatars", file: ApiFile): string | undefined {
  return cdn && file?._id ? `${cdn}/${tag}/${file._id}` : undefined;
}

/** The media server of this instance, without a trailing slash */
export function useCdn(): string | undefined {
  const client = useClient();
  return client.configuration?.features?.autumn?.url?.replace(/\/$/, "");
}
