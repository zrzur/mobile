/** GET /auth/account/data-export (web myData/api.ts) */
export type DataExportStatus = "none" | "pending" | "ready" | "failed";

export type DataExportInfo = {
  status: DataExportStatus;
  requested_at?: string | null;
  expires_at?: string | null;
  next_request_in_seconds: number;
  deletion_grace_days: number;
  contact_email: string;
};

export const DATA_EXPORT_PATH = "/auth/account/data-export";
export const DEFAULT_CONTACT = "privacy@zrzur.com";

/** "You can ask again in {h} h {m} min.": the wait rounded up to minutes */
export function waitParts(seconds: number): { hours: number; minutes: number } {
  const total = Math.max(0, Math.ceil(seconds / 60));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** A new copy can be asked for: nothing pending and the 24 h wait is over */
export function canRequest(info?: DataExportInfo): boolean {
  if (!info) return false;
  return info.status !== "pending" && info.next_request_in_seconds <= 0;
}

/** The address to write to; the server's, else the privacy desk */
export function contactOf(info?: Pick<DataExportInfo, "contact_email">): string {
  return info?.contact_email?.trim() || DEFAULT_CONTACT;
}
