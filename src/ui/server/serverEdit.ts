/**
 * Server edits one after another, per server.
 *
 * `server.edit` puts the whole server from the PATCH answer back into the
 * store. Two edits in flight at once (a switch flipped, then a category made;
 * or two writes the SDK held back for a rate limit and sent together) can
 * answer in either order, and an answer read before the other write landed
 * puts the old value back: the new category vanished from the list although
 * the server had it. One queue per server keeps the answers in order, and a
 * body given as a function is built when its turn comes, from the newest
 * state (two quick category edits do not drop each other).
 */
type Editable = { id: string; edit: (data: never) => Promise<unknown> };
type Body<S> = Record<string, unknown> | ((server: S) => Record<string, unknown>);

const queues = new Map<string, Promise<unknown>>();

export function editServer<S extends Editable>(server: S, body: Body<S>): Promise<void> {
  const before = queues.get(server.id) ?? Promise.resolve();
  const mine = before
    .catch(() => {})
    .then(async () => {
      await server.edit((typeof body === "function" ? body(server) : body) as never);
    });
  queues.set(server.id, mine);
  const settle = () => {
    if (queues.get(server.id) === mine) queues.delete(server.id);
  };
  mine.then(settle, settle);
  return mine;
}
