import { setupI18n } from "@lingui/core";

import { badgeCount } from "../badge";
import { endedCallId, fcmContent, messageBody, messageTitle, taskData } from "../content";
import { PENDING_MAX_AGE, rememberLink, setInsideApp, takeLink } from "../pending";
import { readPushChoice, shouldPrompt, shouldRegister, subscriptionBody } from "../register";
import { emptyCache, mergeDecision, readCache, remoteEntry } from "../sync";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

describe("subscriptionBody (POST /push/subscribe)", () => {
  it("names the phone service and puts the token in auth", () => {
    expect(subscriptionBody("ios", "abc")).toEqual({ endpoint: "apn", p256dh: "", auth: "abc" });
    expect(subscriptionBody("android", "tok")).toEqual({ endpoint: "fcm", p256dh: "", auth: "tok" });
  });
  it("refuses the web, empty and over-long tokens", () => {
    expect(subscriptionBody("web", "abc")).toBeUndefined();
    expect(subscriptionBody("ios", "")).toBeUndefined();
    expect(subscriptionBody("ios", "t".repeat(1025))).toBeUndefined();
  });
});

describe("when to ask and register", () => {
  it("asks once connected, only while the system still can ask", () => {
    expect(shouldPrompt({ choice: undefined, status: "undetermined", canAskAgain: true, connected: true })).toBe(true);
    expect(shouldPrompt({ choice: undefined, status: "undetermined", canAskAgain: true, connected: false })).toBe(false);
    expect(shouldPrompt({ choice: "off", status: "undetermined", canAskAgain: true, connected: true })).toBe(false);
    expect(shouldPrompt({ choice: undefined, status: "denied", canAskAgain: false, connected: true })).toBe(false);
    expect(shouldPrompt({ choice: undefined, status: "granted", canAskAgain: true, connected: true })).toBe(false);
  });
  it("registers when allowed and not switched off", () => {
    expect(shouldRegister({ choice: undefined, status: "granted" })).toBe(true);
    expect(shouldRegister({ choice: "off", status: "granted" })).toBe(false);
    expect(shouldRegister({ choice: "on", status: "denied" })).toBe(false);
  });
  it("reads the stored switch", () => {
    expect(readPushChoice("on")).toBe("on");
    expect(readPushChoice("off")).toBe("off");
    expect(readPushChoice("maybe")).toBeUndefined();
  });
});

describe("badgeCount", () => {
  it("counts mentions and unread DMs and groups, never muted channels", () => {
    expect(
      badgeCount([
        { type: "TextChannel", unread: true, muted: false, mentions: 2 },
        { type: "TextChannel", unread: true, muted: false, mentions: 0 },
        { type: "DirectMessage", unread: true, muted: false, mentions: 0 },
        { type: "Group", unread: true, muted: false, mentions: 3 },
        { type: "Group", unread: true, muted: true, mentions: 5 },
        { type: "SavedMessages", unread: true, muted: false, mentions: 1 },
      ]),
    ).toBe(6);
    expect(badgeCount([])).toBe(0);
  });
});

describe("fcmContent (Android data messages from pushd)", () => {
  it("shows a message with the author as title, one per channel", () => {
    expect(fcmContent(i18n, { type: "push.message", message: "01M", channel: "01C", author: "01A", author_name: "Sam", body: "hi", image: "" })).toEqual({
      identifier: "channel-01C",
      title: "Sam",
      body: "hi",
      androidChannel: "messages",
      data: { href: "/channel/01C?message=01M", channelId: "01C" },
    });
  });
  it("shows friend requests on their own channel", () => {
    const content = fcmContent(i18n, { type: "push.fr.received", id: "01U", username: "sam" });
    expect(content?.title).toBe("sam sent you a friend request");
    expect(content?.androidChannel).toBe("friends");
    expect(content?.data.href).toBe("/friends?profile=01U");
  });
  it("rings for a call and takes the ring away when it ends", () => {
    expect(fcmContent(i18n, { type: "push.dm.call", channel_id: "01C", ended: "false" })?.identifier).toBe("call-01C");
    expect(fcmContent(i18n, { type: "push.dm.call", channel_id: "01C", ended: "true" })).toBeUndefined();
    expect(endedCallId({ type: "push.dm.call", channel_id: "01C", ended: "true" })).toBe("call-01C");
  });
  it("shows nothing for unknown data", () => {
    expect(fcmContent(i18n, { type: "push.other" })).toBeUndefined();
  });
  it("reads the data out of either task payload shape", () => {
    const data = { type: "push.message", channel: "01C" };
    expect(taskData({ data })).toEqual(data);
    expect(taskData({ data: { data, messageId: "x" } })).toEqual(data);
    expect(taskData({ data: { dataString: "x" } })).toBeUndefined();
  });
});

describe("message titles and bodies (web: NotificationsWorker)", () => {
  it("titles like the web", () => {
    expect(messageTitle({ channelType: "DirectMessage", username: "sam", systemAuthor: false })).toBe("@sam");
    expect(messageTitle({ channelType: "Group", username: "sam", channelName: "Trip", systemAuthor: false })).toBe("@sam - Trip");
    expect(messageTitle({ channelType: "Group", username: "", channelName: "Trip", systemAuthor: true })).toBe("Trip");
    expect(messageTitle({ channelType: "TextChannel", username: "sam", channelName: "general", serverName: "Club", systemAuthor: false })).toBe("@sam (#general, Club)");
    expect(messageTitle({ channelType: "SavedMessages", username: "sam", systemAuthor: false })).toBeUndefined();
  });
  it("uses the text, else the attachment count", () => {
    expect(messageBody(i18n, { content: "hello", attachments: 0 })).toBe("hello");
    expect(messageBody(i18n, { content: "", attachments: 2 })).toBe("Sent 2 attachments");
    expect(messageBody(i18n, { content: "secret", attachments: 0, hidePreview: true })).toBe("New message");
  });
});

describe("sync with the account setting", () => {
  it("reads the fetch answer", () => {
    expect(remoteEntry({ notifications: [5, "{}"] })).toEqual({ ts: 5, value: "{}" });
    expect(remoteEntry({})).toBeUndefined();
  });
  it("the newer revision wins; an unsent change is sent", () => {
    expect(mergeDecision({ ts: 1, dirty: false }, { ts: 2 })).toBe("take");
    expect(mergeDecision({ ts: 3, dirty: true }, { ts: 2 })).toBe("send");
    expect(mergeDecision({ ts: 1, dirty: true }, { ts: 2 })).toBe("take");
    expect(mergeDecision({ ts: 2, dirty: false }, { ts: 2 })).toBe("keep");
    expect(mergeDecision({ ts: 2, dirty: true }, undefined)).toBe("send");
    expect(mergeDecision({ ts: 0, dirty: false }, undefined)).toBe("keep");
  });
  it("reads a broken cache as empty", () => {
    expect(readCache("nope")).toEqual(emptyCache());
    expect(readCache(JSON.stringify({ ts: 4, dirty: true, value: "{}", servers: { c: "s", bad: 1 }, serverDefaults: { s: "All", t: "x" } }))).toEqual({
      ts: 4,
      dirty: true,
      value: "{}",
      servers: { c: "s" },
      serverDefaults: { s: "All" },
    });
  });
});

describe("a link kept for after sign-in", () => {
  afterEach(() => setInsideApp(false));
  it("is opened once and not when too old", () => {
    rememberLink("/channel/x", 1000);
    expect(takeLink(2000)).toBe("/channel/x");
    expect(takeLink(2000)).toBeUndefined();
    rememberLink("/channel/x", 0);
    expect(takeLink(PENDING_MAX_AGE + 1)).toBeUndefined();
  });
  it("is not kept while someone is inside, nor for Home", () => {
    setInsideApp(true);
    rememberLink("/channel/x", 0);
    expect(takeLink(1)).toBeUndefined();
    setInsideApp(false);
    rememberLink("/home", 0);
    expect(takeLink(1)).toBeUndefined();
  });
});
