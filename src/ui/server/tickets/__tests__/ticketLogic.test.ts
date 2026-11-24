import { initialKind, readServerTickets, readTicket, ticketActions, transcriptFile, transcriptLine, transcriptText } from "../ticketLogic";

describe("tickets", () => {
  it("reads a channel's ticket state", () => {
    expect(readTicket({ ticket: { opener: "u1", number: 4, closed: true, kind: "Support", claimed_by: "s1" } })).toEqual({ opener: "u1", number: 4, closed: true, kind: "Support", claimedBy: "s1" });
    expect(readTicket({ ticket: { opener: "u1" } })).toEqual({ opener: "u1", number: 0, closed: false, kind: undefined, claimedBy: undefined });
    expect(readTicket({ name: "general" })).toBeUndefined();
    expect(readTicket(null)).toBeUndefined();
  });
  it("reads a server's ticket settings", () => {
    expect(readServerTickets({ tickets: { enabled: true, label: "Help", types: [{ id: "a", name: "Support" }, { id: 3 }] } })).toEqual({ enabled: true, label: "Help", types: [{ id: "a", name: "Support" }] });
    expect(readServerTickets({})).toEqual({ enabled: false, label: undefined, types: [] });
  });
  it("offers the web's actions", () => {
    const open = { opener: "me", number: 1, closed: false };
    expect(ticketActions(open, "me", false)).toEqual(["save", "close"]);
    expect(ticketActions(open, "staff", false)).toEqual(["claim", "save", "close"]);
    expect(ticketActions({ ...open, claimedBy: "staff" }, "staff", false)).toEqual(["unclaim", "save", "close"]);
    expect(ticketActions({ ...open, closed: true }, "staff", false)).toEqual(["save", "reopen"]);
    expect(ticketActions({ ...open, closed: true }, "staff", true)).toEqual(["save", "reopen", "delete"]);
  });
  it("chooses the only kind", () => {
    expect(initialKind([{ id: "a", name: "A" }])).toBe("a");
    expect(initialKind([{ id: "a", name: "A" }, { id: "b", name: "B" }])).toBeUndefined();
    expect(initialKind([])).toBeUndefined();
  });
  it("writes the conversation as the web does", () => {
    const line = transcriptLine(new Date(Date.UTC(2026, 10, 23, 18, 5)), "Sara", "hello\nthere", 2);
    expect(line).toBe("[2026-11-23 18:05] Sara: hello\n    there [2 file(s)]");
    expect(transcriptLine(new Date(Date.UTC(2026, 0, 1)), "A", "x", 0)).toBe("[2026-01-01 00:00] A: x");
    expect(transcriptText("ticket-4", "Support", "", ["b", "a"])).toBe("ticket-4 (Support)\n\na\nb\n");
    expect(transcriptText("ticket-4", undefined, "About a bug", ["a"])).toBe("ticket-4\nAbout a bug\n\na\n");
    expect(transcriptFile("ticket/4")).toBe("ticket-4.txt");
    expect(transcriptFile("")).toBe("ticket.txt");
  });
});
