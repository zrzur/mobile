import { replySubject } from "@/ui/threads/official";

import { digitalTime, slowmodeLeft, splitDuration } from "../slowmode";

describe("slowmode", () => {
  it("counts the wait down from when the server said it", () => {
    expect(slowmodeLeft(undefined, 0)).toBe(0);
    expect(slowmodeLeft({ retry_after: 10, receivedAt: 1000 }, 1000)).toBe(11);
    expect(slowmodeLeft({ retry_after: 10, receivedAt: 1000 }, 6000)).toBe(6);
    expect(slowmodeLeft({ retry_after: 10, receivedAt: 1000 }, 11_200)).toBe(0);
    expect(slowmodeLeft({ retry_after: 5 }, 0)).toBe(6);
  });

  it("shows the countdown like a clock", () => {
    expect(digitalTime(5)).toBe("0:05");
    expect(digitalTime(75)).toBe("1:15");
    expect(digitalTime(3725)).toBe("1:02:05");
    expect(digitalTime(-3)).toBe("0:00");
  });

  it("splits the channel's rule into hours, minutes and seconds", () => {
    expect(splitDuration(3725)).toEqual({ hours: 1, minutes: 2, seconds: 5 });
    expect(splitDuration(30)).toEqual({ hours: 0, minutes: 0, seconds: 30 });
  });
});

describe("official conversation", () => {
  it("answers the newest official message by its first line", () => {
    const re = (first: string) => `Re: ${first}`;
    expect(replySubject("**Update** to the rules\nmore", re)).toBe("Re: Update to the rules");
    expect(replySubject("", re)).toBe("");
    expect(replySubject(undefined, re)).toBe("");
    expect(replySubject("x".repeat(200), re)).toHaveLength(120);
  });
});
