import { expect, test } from "bun:test"
import type { Comment } from "../../types"
import type { Position } from "../../providers/agent/position"
import { ATTACHMENT_LINES } from "./references"
import { threadAttachment, threadsAt } from "./position-threads"

const comment = (fields: Partial<Comment> & Pick<Comment, "id">): Comment => ({
  filename: "a.ts",
  line: 10,
  side: "RIGHT",
  body: fields.id,
  createdAt: "2026-10-01T10:00:00Z",
  status: "synced",
  author: "bob",
  ...fields,
})

const at = (fields: Partial<Position>): Position => ({ path: "a.ts", excerpt: [], label: "a.ts", ...fields })
const header = at({})
const ids = (position: Position, comments: Comment[]) => threadsAt(position, comments).map((t) => t.id)

test("a line takes the threads on its side only", () => {
  const comments = [comment({ id: "new" }), comment({ id: "old", side: "LEFT" }), comment({ id: "below", line: 11 })]
  expect(ids(at({ side: "new", line: 10 }), comments)).toEqual(["new"])
  expect(ids(at({ side: "old", line: 10 }), comments)).toEqual(["old"])
})

test("a unified context row also takes the old side's threads on its old line", () => {
  const comments = [
    comment({ id: "new", line: 12 }),
    comment({ id: "old", side: "LEFT", line: 10 }),
    comment({ id: "old-range", side: "LEFT", startLine: 8, line: 11 }),
    comment({ id: "old-elsewhere", side: "LEFT", line: 12 }),
    comment({ id: "old-file", side: "LEFT", line: 0 }),
  ]
  expect(ids(at({ side: "new", line: 12, oldLine: 10 }), comments)).toEqual(["old", "old-range", "new"])
})

test("without an old line, as in split's right pane, the old side's threads stay out", () => {
  const comments = [comment({ id: "old", side: "LEFT", line: 10 })]
  expect(ids(at({ side: "new", line: 12 }), comments)).toEqual([])
})

test("a selection keeps to its side, old line or not", () => {
  const comments = [comment({ id: "old", side: "LEFT", line: 10 })]
  expect(ids(at({ side: "new", line: 12, oldLine: 10, selection: { start: 9, end: 12 } }), comments)).toEqual([])
})

test("a selection takes every thread whose range overlaps it", () => {
  const comments = [
    comment({ id: "before", line: 4 }),
    comment({ id: "edge", line: 5 }),
    comment({ id: "spans", startLine: 2, line: 9 }),
    comment({ id: "inside", line: 7 }),
    comment({ id: "after", line: 9, startLine: 9 }),
  ]
  expect(ids(at({ side: "new", line: 8, selection: { start: 5, end: 8 } }), comments)).toEqual([
    "edge",
    "inside",
    "spans",
  ])
})

test("a multi-line thread is hit on its first line as on its last", () => {
  const comments = [comment({ id: "range", startLine: 3, line: 6 })]
  expect(ids(at({ side: "new", line: 3 }), comments)).toEqual(["range"])
  expect(ids(at({ side: "new", line: 2 }), comments)).toEqual([])
})

test("the file header takes every thread of the file, those on the whole file too", () => {
  const comments = [comment({ id: "line" }), comment({ id: "file", line: 0 }), comment({ id: "old", side: "LEFT", line: 3 })]
  expect(ids(header, comments).sort()).toEqual(["file", "line", "old"])
})

test("a thread on the whole file goes with no line", () => {
  const comments = [comment({ id: "zero", line: 0 }), comment({ id: "none", line: undefined as unknown as number })]
  expect(ids(at({ side: "new", line: 1, selection: { start: 0, end: 20 } }), comments)).toEqual([])
})

test("another file's threads stay out", () => {
  expect(ids(at({ side: "new", line: 10 }), [comment({ id: "b", filename: "b.ts" })])).toEqual([])
  expect(ids(header, [comment({ id: "b", filename: "b.ts" })])).toEqual([])
})

test("a resolved thread goes with its state, and the reviewer's local comments go too", () => {
  const comments = [
    comment({ id: "done", isThreadResolved: true, body: "Fixed?" }),
    comment({ id: "mine", inReplyTo: "done", author: undefined, status: "local", body: "Yes." }),
  ]
  const attached = threadAttachment(threadsAt(at({ side: "new", line: 10 }), comments))!
  expect(attached.label).toBe("1 thread")
  expect(attached.attachment.split("\n")).toEqual([
    "[Thread done on a.ts:10 (resolved)]",
    "--- bob, 2026-10-01",
    "Fixed?",
    "--- you, 2026-10-01, local",
    "Yes.",
  ])
})

test("no thread attaches nothing; several are counted in the label", () => {
  expect(threadAttachment([])).toBeNull()
  const two = threadsAt(header, [comment({ id: "a" }), comment({ id: "b", line: 12 })])
  expect(threadAttachment(two)!.label).toBe("2 threads")
})

test(`the threads are cut at ${ATTACHMENT_LINES} lines in all, naming each one cut or left out`, () => {
  const long = (id: string, line: number) =>
    comment({ id, line, body: Array.from({ length: 150 }, (_, i) => `${id} ${i}`).join("\n") })
  const threads = threadsAt(header, [long("t1", 1), long("t2", 2), long("t3", 3), long("t4", 4)])
  const lines = threadAttachment(threads)!.attachment.split("\n")
  expect(lines).toHaveLength(ATTACHMENT_LINES + 1)
  expect(lines[0]).toBe("[Thread t1 on a.ts:1 (open)]")
  expect(lines[152]).toBe("[Thread t2 on a.ts:2 (open)]")
  expect(lines.at(-1)).toBe(
    `[cut at ${ATTACHMENT_LINES} of 608 lines; read_thread id=t3, read_thread id=t4 for the rest]`,
  )
})
