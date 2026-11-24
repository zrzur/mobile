import { PICKER_LIMIT, pickableMembers } from "../memberSearch";

const people = [
  { id: "u1", name: "Sami", username: "sami" },
  { id: "u2", name: "أحمد", username: "ahmad" },
  { id: "u3", name: "Lena", username: "lena_k" },
  { id: "u4", name: "Owner", username: "boss" },
];

describe("pickableMembers", () => {
  it("offers everyone not excluded when nothing is typed", () => {
    expect(pickableMembers(people, "", ["u4", undefined]).map((m) => m.id)).toEqual(["u1", "u2", "u3"]);
    expect(pickableMembers(people, "   ", []).map((m) => m.id)).toEqual(["u1", "u2", "u3", "u4"]);
  });

  it("matches the name or the username, ignoring case", () => {
    expect(pickableMembers(people, "SAM", []).map((m) => m.id)).toEqual(["u1"]);
    expect(pickableMembers(people, "lena_", []).map((m) => m.id)).toEqual(["u3"]);
    expect(pickableMembers(people, "nobody", [])).toEqual([]);
  });

  it("folds Arabic: any alef form finds the name", () => {
    expect(pickableMembers(people, "احمد", []).map((m) => m.id)).toEqual(["u2"]);
  });

  it("never offers an excluded person, even when searched for", () => {
    expect(pickableMembers(people, "boss", ["u4"])).toEqual([]);
  });

  it("lists at most the limit", () => {
    const many = Array.from({ length: PICKER_LIMIT + 20 }, (_, i) => ({ id: `u${i}`, name: `Person ${i}` }));
    expect(pickableMembers(many, "", [])).toHaveLength(PICKER_LIMIT);
  });
});
