import { expect, test } from "bun:test"
import {
  addComment,
  cancelInlineComposer,
  createInitialState,
  openInlineCommentOverlay,
  rememberCommentDraft,
  setInlineCommentInput,
  type AppState,
} from "../state"
import { createComment } from "../types"
import { buildFileTree } from "../utils/file-tree"
import { parseDiff } from "../utils/diff-parser"
import { BUSY, DROPPED, ENDED, createProposals } from "./proposals"

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@
 one
-two
+TWO
 three
`

const PROPOSAL = { path: "src/a.ts", line: 2, side: "new" as const, text: "Why upper case?" }
const ANCHOR = { filename: "src/a.ts", line: 2, side: "RIGHT" as const }

function setup(patch: (state: AppState) => AppState = (s) => s) {
  const files = parseDiff(DIFF)
  let state = patch(createInitialState(files, buildFileTree(files), "test", ""))
  const notes: string[] = []
  const revealed: unknown[] = []
  const proposals = createProposals({
    getState: () => state,
    setState: (fn) => (state = fn(state)),
    render: () => {},
    reveal: (anchor) => void revealed.push(anchor),
    fillComposer: () => {},
    note: (text) => void notes.push(text),
  })
  const outcomes: string[] = []
  const propose = (proposal = PROPOSAL) => proposals.proposeComment(proposal).then((o) => void outcomes.push(o))
  return {
    proposals,
    notes,
    revealed,
    outcomes,
    propose,
    state: () => state,
    update: (fn: (s: AppState) => AppState) => (state = fn(state)),
  }
}

// What the composer's keys do to state, before they report.
const escape = (s: AppState) => cancelInlineComposer(rememberCommentDraft(s, s.inlineCommentOverlay.input))
function save(s: AppState): AppState {
  const ov = s.inlineCommentOverlay
  const comment = createComment(ov.filename, ov.line, ov.input.trim(), ov.side, "@you")
  return cancelInlineComposer(addComment(s, comment))
}
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

test("a proposal opens the composer on its line, holding the agent's text, and says so in the chat", () => {
  const t = setup((s) => ({ ...s, viewMode: "feed" }))
  void t.propose()
  const ov = t.state().inlineCommentOverlay
  expect([ov.open, ov.mode, ov.filename, ov.line, ov.side, ov.input]).toEqual([
    true, "compose", "src/a.ts", 2, "RIGHT", "Why upper case?",
  ])
  expect(t.state().viewMode).toBe("diff")
  expect(t.revealed).toEqual([ANCHOR])
  expect(t.notes).toEqual(["Proposed a comment on src/a.ts:2 — it is open in the thread panel."])
})

test("a refused place opens nothing and returns why", async () => {
  const t = setup()
  void t.propose({ ...PROPOSAL, line: 40 })
  await settled()
  expect(t.outcomes).toEqual([
    "src/a.ts:40 on the new side is not a line of the diff; comments go on lines the diff shows.",
  ])
  expect(t.state().inlineCommentOverlay.open).toBe(false)
})

test("a second proposal is refused while the first is open", async () => {
  const t = setup()
  void t.propose()
  void t.propose({ ...PROPOSAL, line: 1 })
  await settled()
  expect(t.outcomes).toEqual([BUSY])
})

test("a draft the reviewer left on the line is never replaced", async () => {
  const t = setup((s) =>
    cancelInlineComposer(rememberCommentDraft(openInlineCommentOverlay(s, "src/a.ts", 2, "RIGHT", "compose"), "half")),
  )
  t.update((s) => ({ ...s, inlineCommentOverlay: { ...s.inlineCommentOverlay, open: false } }))
  void t.propose()
  await settled()
  expect(t.outcomes).toEqual([
    "The reviewer has an unsaved draft on src/a.ts:2; it stays theirs, so nothing opened there.",
  ])
  expect(t.state().commentDrafts.get("src/a.ts:2:RIGHT")).toBe("half")
})

test("a proposal waits while the reviewer writes a comment, and opens once it is saved", async () => {
  const t = setup((s) => setInlineCommentInput(openInlineCommentOverlay(s, "src/a.ts", 1, "RIGHT", "compose"), "mine"))
  void t.propose()
  expect(t.state().inlineCommentOverlay.input).toBe("mine")
  expect(t.notes).toEqual([
    "The comment proposed on src/a.ts:2 waits until the comment open in the thread panel is saved or dropped.",
  ])
  t.proposals.check()
  expect(t.state().inlineCommentOverlay.line).toBe(1)

  t.update(save)
  t.proposals.composerSettled("saved")
  t.proposals.afterRender()
  await settled()
  const ov = t.state().inlineCommentOverlay
  expect([ov.mode, ov.line, ov.input]).toEqual(["compose", 2, "Why upper case?"])
  expect(t.outcomes).toEqual([])
})

test("saving reports the comment as the reviewer left it", async () => {
  const t = setup()
  void t.propose()
  t.update((s) => save(setInlineCommentInput(s, "Why upper case here?")))
  t.proposals.composerSettled("saved")
  await settled()
  expect(t.outcomes).toEqual(["The reviewer saved it as a local comment on src/a.ts:2: Why upper case here?"])
})

test("the publish chord reports it published", async () => {
  const t = setup()
  void t.propose()
  t.update(save)
  t.proposals.composerSettled("published")
  await settled()
  expect(t.outcomes).toEqual(["The reviewer saved it and published it to GitHub: Why upper case?"])
})

test("a save that saved nothing leaves the proposal open", async () => {
  const t = setup()
  void t.propose()
  t.proposals.composerSettled("saved")
  await settled()
  expect(t.outcomes).toEqual([])
})

test("dropping the agent's text untouched forgets it, so the line takes the next proposal", async () => {
  const t = setup()
  void t.propose()
  t.update(escape)
  t.proposals.composerSettled("dropped")
  await settled()
  expect(t.outcomes).toEqual([DROPPED])
  expect(t.state().commentDrafts.size).toBe(0)
})

test("dropping it after editing keeps the draft, as Esc always does", async () => {
  const t = setup()
  void t.propose()
  t.update((s) => escape(setInlineCommentInput(s, "Why upper case? Mine now")))
  t.proposals.composerSettled("dropped")
  await settled()
  expect(t.outcomes).toEqual([DROPPED])
  expect(t.state().commentDrafts.get("src/a.ts:2:RIGHT")).toBe("Why upper case? Mine now")
})

test("a composer closed some other way counts as dropped, once", async () => {
  const t = setup()
  void t.propose()
  t.update((s) => ({ ...s, inlineCommentOverlay: { ...s.inlineCommentOverlay, open: false, mode: "view" } }))
  t.proposals.afterRender()
  t.proposals.afterRender()
  await settled()
  t.proposals.composerSettled("dropped")
  t.proposals.check()
  await settled()
  expect(t.outcomes).toEqual([DROPPED])
})

test("the conversation ending answers a waiting proposal and leaves the composer alone", async () => {
  const t = setup()
  void t.propose()
  t.update((s) => setInlineCommentInput(s, "Reviewer's now"))
  t.proposals.endConversation()
  await settled()
  expect(t.outcomes).toEqual([ENDED])
  expect(t.state().inlineCommentOverlay.input).toBe("Reviewer's now")
  t.proposals.composerSettled("dropped")
  await settled()
  expect(t.outcomes).toEqual([ENDED])
})
