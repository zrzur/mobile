import { dismissEphemeral, feedInteractionEvent, interactionSnapshot, resetInteractionsForTest } from "../store";

jest.mock("../../upload", () => ({ uploadAttachment: jest.fn() }));

const id = "01J00000000000000000000000";
const message = (patch: object = {}) => ({ _id: id, interaction_id: "I1", author: "BOT", channel_id: "C1", content: "hi", ...patch });

describe("interaction state from the gateway", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.UTC(2024, 5, 1));
    resetInteractionsForTest();
  });
  afterEach(() => jest.useRealTimers());

  it("adds, updates and removes a private answer", () => {
    feedInteractionEvent({ type: "EphemeralMessageCreate", message: message() });
    expect(interactionSnapshot().ephemeral.C1).toHaveLength(1);
    feedInteractionEvent({ type: "EphemeralMessageUpdate", message: message({ content: "edited" }) });
    expect(interactionSnapshot().ephemeral.C1[0].content).toBe("edited");
    feedInteractionEvent({ type: "EphemeralMessageDelete", id, channel_id: "C1" });
    expect(interactionSnapshot().ephemeral.C1).toBeUndefined();
  });

  it("lets the person dismiss an answer", () => {
    feedInteractionEvent({ type: "EphemeralMessageCreate", message: message() });
    dismissEphemeral("C1", id);
    expect(interactionSnapshot().ephemeral).toEqual({});
    // dismissing twice changes nothing
    dismissEphemeral("C1", id);
    expect(interactionSnapshot().ephemeral).toEqual({});
  });

  it("opens a bot's form for its channel", () => {
    feedInteractionEvent({ type: "InteractionModal", id: "I2", channel_id: "C1", modal: { custom_id: "m", title: "Form", components: [] } });
    expect(interactionSnapshot().modal).toMatchObject({ id: "I2", channelId: "C1", modal: { title: "Form" } });
  });

  it("forgets a server's command lists when its bots change them", () => {
    // seed two lists through the public loader's cache shape
    const snap = interactionSnapshot();
    snap.commands["S#C"] = { applications: [], commands: [] };
    snap.commands["T#C"] = { applications: [], commands: [] };
    feedInteractionEvent({ type: "ApplicationCommandsUpdate", application_id: "BOT", server_id: "S" });
    expect(Object.keys(interactionSnapshot().commands)).toEqual(["T#C"]);
  });
});
