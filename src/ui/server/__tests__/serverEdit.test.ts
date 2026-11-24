import { editServer } from "../serverEdit";

function fakeServer(id = "s1") {
  const sent: Record<string, unknown>[] = [];
  const pending: (() => void)[] = [];
  const server = {
    id,
    categories: ["a"],
    edit: (data: never) =>
      new Promise<void>((resolve, reject) => {
        sent.push(data as Record<string, unknown>);
        pending.push(() => ((data as { fail?: boolean }).fail ? reject(new Error("refused")) : resolve()));
      }),
  };
  return { server, sent, pending };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("editServer", () => {
  it("sends the next edit only after the previous answer", async () => {
    const { server, sent, pending } = fakeServer();
    const one = editServer(server, { threads_disabled: false });
    const two = editServer(server, { name: "x" });
    await tick();
    expect(sent).toEqual([{ threads_disabled: false }]);
    pending[0]();
    await one;
    await tick();
    expect(sent).toEqual([{ threads_disabled: false }, { name: "x" }]);
    pending[1]();
    await two;
  });

  it("builds a function body when its turn comes, from the newest state", async () => {
    const { server, sent, pending } = fakeServer();
    const one = editServer(server, (s) => ({ categories: [...s.categories, "b"] }));
    const two = editServer(server, (s) => ({ categories: [...s.categories, "c"] }));
    await tick();
    server.categories = ["a", "b"]; // the first answer landed in the store
    pending[0]();
    await one;
    await tick();
    expect(sent[1]).toEqual({ categories: ["a", "b", "c"] });
    pending[1]();
    await two;
  });

  it("a refused edit rejects its caller and does not block the next one", async () => {
    const { server, sent, pending } = fakeServer();
    const one = editServer(server, { fail: true });
    const two = editServer(server, { name: "y" });
    await tick();
    pending[0]();
    await expect(one).rejects.toThrow("refused");
    await tick();
    expect(sent).toHaveLength(2);
    pending[1]();
    await expect(two).resolves.toBeUndefined();
  });

  it("keeps servers apart", async () => {
    const a = fakeServer("a");
    const b = fakeServer("b");
    void editServer(a.server, { name: "1" });
    void editServer(b.server, { name: "2" });
    await tick();
    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(1);
    a.pending[0]();
    b.pending[0]();
  });
});
