import { expect, test } from "bun:test"
import type { Comment } from "../../types"
import { TWO_FILES } from "../../testing/diffs"
import { parseDiff } from "../../utils/diff-parser"
import { readToolDefinitions } from "./read-tool-definitions"
import { PAGE_LINES, READS_PER_ANSWER, createReadTools } from "./read-tools"
import { TREE_CUT_OFF, type ConversationEntry, type ReviewSource } from "./review-source"

const files = parseDiff(TWO_FILES)

const comment = (fields: Partial<Comment> & Pick<Comment, "id">): Comment => ({
  filename: "src/greet.ts",
  line: 2,
  side: "RIGHT",
  body: "",
  createdAt: "2026-10-01T10:00:00Z",
  status: "synced",
  ...fields,
})

function tools(
  overrides: Partial<ReviewSource> & { text?: string } = {},
  failures: string[] = [],
) {
  const text = overrides.text ?? "x"
  const source: ReviewSource = {
    files: () => files,
    hiddenPaths: () => new Set(),
    fileText: async (path) => {
      if (path === "boom") {
        throw new Error("GitHub is not reachable")
      }
      return path === "gone" ? { kind: "missing" } : { kind: "text", text }
    },
    tree: async () => ["README.md", "src/greet.ts", "src/farewell.ts"],
    comments: () => [],
    conversation: () => null,
    ...overrides,
  }
  return createReadTools(source, (what) => failures.push(what))
}

test("lists the changed files with status and counts, optionally under a directory", async () => {
  expect((await tools().listFiles()).text).toBe(
    "modified src/greet.ts (+2 -1)\nadded src/farewell.ts (+3 -0)",
  )
  expect((await tools().listFiles("docs")).text).toBe("No changed files under docs.")
})

test("hidden files are left out of the list, counted, and still readable by path", async () => {
  const t = tools({ hiddenPaths: () => new Set(["src/farewell.ts"]) })
  expect((await t.listFiles()).text).toBe(
    "modified src/greet.ts (+2 -1)\n1 more file hidden by the reviewer's ignore patterns; read_diff reads them by path.",
  )
  expect((await t.readDiff("src/farewell.ts")).text).toContain("    1 +export function farewell")
})

test("a long file list pages by offset, and every page says what is hidden", async () => {
  const many = Array.from({ length: PAGE_LINES + 500 }, (_, i) => ({ ...files[0]!, filename: `src/f${i}.ts` }))
  const t = tools({ files: () => [...many, files[1]!], hiddenPaths: () => new Set([files[1]!.filename]) })
  const hiddenNote = "1 more file hidden by the reviewer's ignore patterns; read_diff reads them by path."

  const first = (await t.listFiles()).text.split("\n")
  expect(first[0]).toBe("modified src/f0.ts (+2 -1)")
  expect(first.at(-2)).toBe(
    `[lines 1–${PAGE_LINES} of ${PAGE_LINES + 500}; call again with offset=${PAGE_LINES} for more]`,
  )
  expect(first.at(-1)).toBe(hiddenNote)

  const rest = (await t.listFiles(undefined, PAGE_LINES)).text.split("\n")
  expect(rest[0]).toBe(`modified src/f${PAGE_LINES}.ts (+2 -1)`)
  expect(rest.at(-2)).toBe(`modified src/f${PAGE_LINES + 499}.ts (+2 -1)`)
  expect(rest.at(-1)).toBe(hiddenNote)
  expect(rest).toHaveLength(501)
})

test("lists hunks and reads one with old and new numbers", async () => {
  const t = tools()
  expect((await t.listHunks("src/greet.ts")).text).toBe("0: @@ -1,5 +1,5 @@")
  expect((await t.readDiff("src/greet.ts", 0)).text.split("\n").slice(0, 3)).toEqual([
    "@@ -1,5 +1,5 @@",
    "    1     1  export function greet(name: string) {",
    '    2       -  return "Hello " + name',
  ])
  expect((await t.readDiff("src/greet.ts", 4)).text).toBe("src/greet.ts has no hunk 4; it has 1.")
  expect((await t.readDiff("nope.ts")).text).toBe("nope.ts is not a changed file.")
})

test(`cuts a result at ${PAGE_LINES} lines and says how to page on`, async () => {
  const long = Array.from({ length: PAGE_LINES + 5 }, (_, i) => `line ${i}`).join("\n")
  const first = (await tools({ text: long }).readFile("big.txt", "head")).text
  expect(first.split("\n")).toHaveLength(PAGE_LINES + 1)
  expect(first).toContain(`call again with offset=${PAGE_LINES}`)
  const rest = (await tools({ text: long }).readFile("big.txt", "head", PAGE_LINES)).text
  expect(rest.split("\n")).toHaveLength(5)
  expect(rest).not.toContain("offset=")
})

test("reads any file at head or base, numbered from 1, and says when it does not exist", async () => {
  expect((await tools({ text: "a\nb\n" }).readFile("README.md", "base")).text).toBe("    1 a\n    2 b")
  expect((await tools().readFile("gone", "head")).text).toBe("gone at head: does not exist.")
  const binary = tools({ fileText: async () => ({ kind: "binary" }) })
  expect((await binary.readFile("logo.png", "head")).text).toBe("logo.png at head: binary file.")
})

test("lists the tree under a directory, keeping a cut-off note", async () => {
  expect((await tools().listTree("src")).text).toBe("src/greet.ts\nsrc/farewell.ts")
  expect((await tools().listTree("lib")).text).toBe("No paths under lib.")
  const cut = tools({ tree: async () => ["a/x.ts", "b/y.ts", TREE_CUT_OFF] })
  expect((await cut.listTree("a")).text).toBe(`a/x.ts\n${TREE_CUT_OFF}`)
})

test("a failed read goes back to the agent as an error and is reported", async () => {
  const failures: string[] = []
  const result = await tools({}, failures).readFile("boom", "head")
  expect(result).toEqual({ text: "Read failed: GitHub is not reachable", isError: true })
  expect(failures).toEqual(["boom at head: GitHub is not reachable"])
})

test(`refuses the read after ${READS_PER_ANSWER} in one answer, until the next answer`, async () => {
  const t = tools()
  for (let i = 0; i < READS_PER_ANSWER; i++) {
    await t.listFiles()
  }
  const refused = await t.listFiles()
  expect(refused.isError).toBe(true)
  expect(refused.text).toContain("Read limit reached")
  t.startAnswer()
  expect((await t.listFiles()).isError).toBeUndefined()
})

const thread = [
  comment({
    id: "c1",
    side: "LEFT",
    author: "bob",
    body: "Why concatenate?\nIt allocates.",
    outdated: true,
  }),
  comment({ id: "c2", inReplyTo: "c1", body: "Habit.", localEdit: "Fixed.", createdAt: "2026-10-02T10:00:00Z" }),
  comment({ id: "c3", filename: "src/farewell.ts", line: 3, startLine: 1, body: "Rename?", status: "local" }),
  comment({ id: "c4", filename: "README.md", line: 1, body: "Stale.", status: "local", kind: "note" }),
]

test("lists the threads with their side, state, first author and first line", async () => {
  const t = tools({ comments: () => thread })
  expect((await t.listThreads()).text.split("\n")).toEqual([
    "c4 README.md:1 (open) you: Stale.",
    "c3 src/farewell.ts:1-3 (open) you: Rename?",
    "c1 src/greet.ts:2 (old) (open, outdated) bob: Why concatenate?",
  ])
})

test("reads a thread by id, the local edit over GitHub's text", async () => {
  const t = tools({ comments: () => thread })
  expect((await t.readThread("c1")).text.split("\n")).toEqual([
    "Thread c1 on src/greet.ts:2 (old) (open, outdated)",
    "--- bob, 2026-10-01",
    "Why concatenate?",
    "It allocates.",
    "--- you, 2026-10-02, edited, not yet on GitHub",
    "Fixed.",
  ])
  expect((await t.readThread("c9")).text).toBe("No thread c9; list_threads lists them.")
})

test("lists the reviewer's comments that are not on GitHub as written, notes included", async () => {
  const t = tools({ comments: () => thread })
  expect((await t.listComments()).text.split("\n")).toEqual([
    "--- c2 on src/greet.ts:2 (edited, not yet on GitHub)",
    "Fixed.",
    "--- c3 on src/farewell.ts:1-3 (local)",
    "Rename?",
    "--- c4 on README.md:1 (note, local)",
    "Stale.",
  ])
  expect((await tools().listComments()).text).toBe("The reviewer has no local, pending or edited comments.")
})

test("the agent sees every read tool, read-only and loaded up front", () => {
  const definitions = readToolDefinitions(tools())
  expect(definitions.map((d) => d.name)).toEqual([
    "list_files",
    "list_hunks",
    "read_diff",
    "read_file",
    "list_tree",
    "list_threads",
    "read_thread",
    "list_comments",
    "read_conversation",
  ])
  const loadedReadOnly = (d: (typeof definitions)[number]) =>
    d._meta?.["anthropic/alwaysLoad"] === true && d.annotations?.readOnlyHint === true
  expect(definitions.every(loadedReadOnly)).toBe(true)
})

const fileLevel = (line: number | undefined) => [
  comment({ id: "f1", filename: "src/farewell.ts", line: line as number, author: "bob", body: "Split this file." }),
  comment({ id: "f2", filename: "README.md", line: line as number, side: "LEFT", body: "Drop it.", status: "local" }),
]

for (const line of [0, undefined]) {
  test(`a comment on a whole file (line ${line}) reads as its path and (file)`, async () => {
    const t = tools({ comments: () => fileLevel(line) })
    expect((await t.listThreads()).text.split("\n")).toEqual([
      "f2 README.md (file) (open) you: Drop it.",
      "f1 src/farewell.ts (file) (open) bob: Split this file.",
    ])
    expect((await t.readThread("f1")).text.split("\n")[0]).toBe("Thread f1 on src/farewell.ts (file) (open)")
    expect((await t.listComments()).text.split("\n")[0]).toBe("--- f2 on README.md (file) (local)")
  })
}

const conversation: ConversationEntry[] = [
  {
    kind: "comment",
    author: "dana",
    at: "2026-10-01T09:00:00Z",
    body: "Tried it on staging.\nWorks.",
    reactions: [
      { content: "+1", count: 2, viewerHasReacted: false },
      { content: "rocket", count: 1, viewerHasReacted: true },
    ],
  },
  {
    kind: "review",
    author: "bob",
    at: "2026-10-02T11:00:00Z",
    body: "One question about naming.",
    state: "CHANGES_REQUESTED",
    reactions: [],
  },
]

test("reads the PR's conversation in the source's order, reviews with their state, reactions when any", async () => {
  const t = tools({ conversation: () => conversation })
  expect((await t.readConversation()).text.split("\n")).toEqual([
    "--- dana, 2026-10-01",
    "Tried it on staging.",
    "Works.",
    "reactions: +1 2, rocket 1",
    "--- bob, 2026-10-02, review: changes requested",
    "One question about naming.",
  ])
})

test("a local review has no conversation, and an empty one says so", async () => {
  expect((await tools({ conversation: () => null }).readConversation()).text).toBe(
    "A local review has no PR conversation.",
  )
  expect((await tools({ conversation: () => [] }).readConversation()).text).toBe(
    "The PR's conversation has no comments.",
  )
})

test("a long conversation pages by offset", async () => {
  const long = { ...conversation[1]!, body: Array.from({ length: PAGE_LINES }, (_, i) => `l${i}`).join("\n") }
  const t = tools({ conversation: () => [long] })
  const first = (await t.readConversation()).text
  expect(first).toContain(`[lines 1–${PAGE_LINES} of ${PAGE_LINES + 1}; call again with offset=${PAGE_LINES} for more]`)
  expect((await t.readConversation(PAGE_LINES)).text).toBe(`l${PAGE_LINES - 1}`)
})
