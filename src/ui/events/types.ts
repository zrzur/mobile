/**
 * Server events as the web's SDK sees them (web: API.ServerEvent on beta).
 * The installed SDK 2.0.0 knows only "Interested", so the newer fields
 * (answers, seats, drafts, visibility, reminders) are typed here, all
 * optional, and read from the same REST routes the web uses.
 */

export type EventPlace = { type: "Voice"; channel: string } | { type: "Text"; channel: string } | { type: "External"; location: string };

export type EventStatus = "Scheduled" | "Active" | "Completed" | "Cancelled" | "Draft";
export type EventRepeat = "Daily" | "Weekly" | "EveryTwoWeeks" | "Monthly";
export type EventVisibility = "Place" | "Roles" | "Invited";
export type AttendeeList = "Organisers" | "Participants" | "Everyone";
export type EventAnswerValue = "Going" | "Maybe" | "NotGoing";

export type EventCounts = { going: number; maybe: number; not_going: number; waiting: number };

export type ServerEvent = {
  _id: string;
  server: string;
  creator: string;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  place: EventPlace;
  cover?: { _id: string; tag?: string } | null;
  status: EventStatus;
  repeat?: EventRepeat | null;
  interested_count: number;
  previous?: string | null;
  time_zone?: string | null;
  counts?: EventCounts;
  capacity?: number | null;
  waitlist?: boolean;
  over_capacity?: boolean;
  visibility?: EventVisibility;
  visible_roles?: string[];
  attendee_list?: AttendeeList;
  co_organisers?: string[];
  invited?: string[] | null;
  started_at?: string | null;
  ended_at?: string | null;
  people_removed_at?: string | null;
  reminders?: number[];
  link?: { code: string; name?: string | null } | null;
  link_public?: boolean;
};

/** Your own answer to one event */
export type Rsvp = { answer: EventAnswerValue; waiting?: boolean; position?: number | null; muted?: boolean };

export type EventList = { events: ServerEvent[]; interested: string[]; answers?: { event: string; answer: EventAnswerValue; waiting?: boolean }[] };

export type EventResponse = { event: ServerEvent; interested: boolean; rsvp?: Rsvp | null; organiser?: boolean };

export type Attendee = { user: { _id: string; username: string; display_name?: string | null; avatar?: { _id: string } | null }; answer: EventAnswerValue; waiting?: boolean; since?: string | null };

export type AttendeeFilter = "Going" | "Waiting" | "Maybe" | "NotGoing";

export type EventChanges = {
  title?: string;
  description?: string;
  starts_at?: string;
  ends_at?: string;
  place?: EventPlace;
  cover?: string;
  repeat?: EventRepeat;
  time_zone?: string;
  draft?: boolean;
  visibility?: EventVisibility;
  visible_roles?: string[];
  attendee_list?: AttendeeList;
  capacity?: number;
  waitlist?: boolean;
  reminders?: number[];
  remove?: ("Description" | "EndsAt" | "Cover" | "Repeat" | "Capacity")[];
};
