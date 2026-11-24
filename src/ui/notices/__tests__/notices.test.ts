import {
  nextNotice,
  noticeText,
  policyText,
  safeNoticeLink,
  safePolicyLink,
  shouldOfferSaveData,
  shouldShowChangelog,
  validChangelog,
} from "../noticeModel";
import { closeSnack, pressSnack, showSnack, SNACK_ACTION_MS, SNACK_PLAIN_MS } from "../snack";

const notice = (id: string, tone = "info") => ({ _id: id, title: { en: `T${id}`, ar: `ع${id}` }, body: { en: "B" }, tone });

describe("notices", () => {
  it("speaks the reader's language, else English", () => {
    expect(noticeText({ en: "Hello", ar: "مرحبا" }, "ar")).toBe("مرحبا");
    expect(noticeText({ en: "Hello", ar: "مرحبا" }, "ar-SY")).toBe("مرحبا");
    expect(noticeText({ en: "Hello" }, "de")).toBe("Hello");
    expect(noticeText({}, "de")).toBe("");
    expect(noticeText(undefined, "en")).toBe("");
  });

  it("tells an important notice first, and each only once", () => {
    const list = [notice("a"), notice("b", "important"), notice("c")];
    expect(nextNotice(list, new Set())?._id).toBe("b");
    expect(nextNotice(list, new Set(["b"]))?._id).toBe("a");
    expect(nextNotice(list, new Set(["a", "b", "c"]))).toBeUndefined();
  });

  it("opens only https notice links and http(s) policy links", () => {
    expect(safeNoticeLink("https://zrzur.com/x")).toBe("https://zrzur.com/x");
    expect(safeNoticeLink("http://zrzur.com/x")).toBeUndefined();
    expect(safeNoticeLink("javascript:alert(1)")).toBeUndefined();
    expect(safeNoticeLink(null)).toBeUndefined();
    expect(safePolicyLink("http://zrzur.com/terms")).toBe("http://zrzur.com/terms");
    expect(safePolicyLink("javascript:alert(1)")).toBeUndefined();
  });

  it("words a policy change in the reader's language", () => {
    const change = { description: "Terms changed", translations: { de: "Bedingungen geändert" }, url: "https://x", effective_time: "2026-12-01" };
    expect(policyText(change, "de")).toBe("Bedingungen geändert");
    expect(policyText(change, "ar")).toBe("Terms changed");
  });
});

describe("what's new", () => {
  const entry = { id: "2", title: "T", markdown_content: "M", published_at: "2026-11-23" };
  it("accepts only a complete feed entry", () => {
    expect(validChangelog(entry)).toBe(true);
    expect(validChangelog({ id: "2", title: "T" })).toBe(false);
    expect(validChangelog(null)).toBe(false);
  });
  it("shows a note once, and never on a fresh install", () => {
    expect(shouldShowChangelog(entry, "1")).toBe(true);
    expect(shouldShowChangelog(entry, "2")).toBe(false);
    expect(shouldShowChangelog(entry, null)).toBe(false);
    expect(shouldShowChangelog(null, "1")).toBe(false);
  });
});

describe("save data offer", () => {
  it("offers once, on mobile data, while Save data is off", () => {
    expect(shouldOfferSaveData({ on: false, offered: false, networkType: "CELLULAR" })).toBe(true);
    expect(shouldOfferSaveData({ on: false, offered: false, networkType: "WIFI" })).toBe(false);
    expect(shouldOfferSaveData({ on: true, offered: false, networkType: "CELLULAR" })).toBe(false);
    expect(shouldOfferSaveData({ on: false, offered: true, networkType: "CELLULAR" })).toBe(false);
    expect(shouldOfferSaveData({ on: false, offered: false, networkType: undefined })).toBe(false);
  });
});

describe("snack", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    closeSnack();
    jest.useRealTimers();
  });

  it("runs the button once and closes", () => {
    const action = jest.fn();
    showSnack({ message: "Hi", action: "Read", onAction: action });
    pressSnack();
    pressSnack();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("closes by itself: later with a button than without", () => {
    const action = jest.fn();
    showSnack({ message: "Hi", action: "Read", onAction: action });
    jest.advanceTimersByTime(SNACK_ACTION_MS + 1);
    pressSnack();
    expect(action).not.toHaveBeenCalled();
    expect(SNACK_ACTION_MS).toBeGreaterThan(SNACK_PLAIN_MS);
  });

  it("an older timer never closes a newer message", () => {
    const first = jest.fn();
    const second = jest.fn();
    showSnack({ message: "one", action: "A", onAction: first, duration: 100 });
    showSnack({ message: "two", action: "B", onAction: second, duration: 1000 });
    jest.advanceTimersByTime(150);
    pressSnack();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
