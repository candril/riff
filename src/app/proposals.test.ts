import { expect, test } from "bun:test"
import {
  addComment,
  cancelInlineComposer,
  createInitialState,
  openInlineCommentOverlay,
  setInlineCommentInput,
  type AppState,
} from "../state"
import { createComment } from "../types"
import { buildFileTree } from "../utils/file-tree"
import { parseDiff } from "../utils/diff-parser"
import { createCommentDraftsState, draftOn, type CommentDraftsState } from "../features/inline-comment-overlay/drafts-state"
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

function setup(patch: (state: AppState) => AppState = (s) => s, keep: (drafts: CommentDraftsState) => void = () => {}) {
  const files = parseDiff(DIFF)
  let state = patch(createInitialState(files, buildFileTree(files), "test", ""))
  const drafts = createCommentDraftsState()
  keep(drafts)
  const notes: string[] = []
  const revealed: unknown[] = []
  const proposals = createProposals({
    getState: () => state,
    setState: (fn) => (state = fn(state)),
    render: () => {},
    reveal: (anchor) => void revealed.push(anchor),
    fillComposer: () => {},
    note: (text) => void notes.push(text),
    commentDrafts: drafts,
  })
  const outcomes: string[] = []
  const propose = (proposal = PROPOSAL) => proposals.proposeComment(proposal).then((o) => void outcomes.push(o))
  return {
    proposals,
    notes,
    revealed,
    outcomes,
    propose,
    drafts,
    state: () => state,
    update: (fn: (s: AppState) => AppState) => (state = fn(state)),
    // What the composer's Esc does, before it reports.
    escape() {
      const ov = state.inlineCommentOverlay
      if (ov.open) drafts.remember(draftOn(ov), ov.input)
      state = cancelInlineComposer(state)
    },
  }
}

// What the composer's keys do to state, before they report.
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
  const t = setup(undefined, (drafts) => drafts.remember(ANCHOR, "half"))
  void t.propose()
  await settled()
  expect(t.outcomes).toEqual([
    "The reviewer has an unsaved draft on src/a.ts:2; it stays theirs, so nothing opened there.",
  ])
  expect(t.drafts.on(ANCHOR)).toBe("half")
})

test("a proposal waits while the reviewer writes a comment, and opens once it is saved", async () => {
  const t = setup((s) => setInlineCommentInput(openInlineCommentOverlay(s, "src/a.ts", 1, "RIGHT", "compose"), "mine"))
  void t.propose()
  expect(t.state().inlineCommentOverlay.input).toBe("mine")
  expect(t.notes).toEqual([
    "The agent's proposal on src/a.ts:2 waits until the comment open in the thread panel is saved or dropped.",
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
  t.escape()
  t.proposals.composerSettled("dropped")
  await settled()
  expect(t.outcomes).toEqual([DROPPED])
  expect(t.drafts.drafts().size).toBe(0)
})

test("dropping it after editing keeps the draft, as Esc always does", async () => {
  const t = setup()
  void t.propose()
  t.update((s) => setInlineCommentInput(s, "Why upper case? Mine now"))
  t.escape()
  t.proposals.composerSettled("dropped")
  await settled()
  expect(t.outcomes).toEqual([DROPPED])
  expect(t.drafts.on(ANCHOR)).toBe("Why upper case? Mine now")
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

const LOCAL = { ...createComment("src/a.ts", 2, "Why?", "RIGHT", "@you"), id: "local-1" }
const SYNCED = { ...createComment("src/a.ts", 3, "On GitHub", "RIGHT", "@you"), id: "gh-1", status: "synced" as const }
const STAGED = { ...SYNCED, id: "gh-2", line: 1, localEdit: "Staged wording" }
const withComments = (s: AppState) => ({ ...s, comments: [LOCAL, SYNCED, STAGED] })

// What Enter does to an edit, before the composer reports.
function saveEdit(s: AppState): AppState {
  const ov = s.inlineCommentOverlay
  const comments = s.comments.map((c) =>
    c.id !== ov.editingId ? c : c.status === "synced" ? { ...c, localEdit: ov.input } : { ...c, body: ov.input },
  )
  return cancelInlineComposer({ ...s, comments })
}

test("new wording opens the reviewer's comment in edit mode, holding the agent's text", () => {
  const t = setup(withComments)
  void t.proposals.proposeEdit("local-1", "Why upper case here?")
  const ov = t.state().inlineCommentOverlay
  expect([ov.open, ov.mode, ov.editingId, ov.input]).toEqual([true, "edit", "local-1", "Why upper case here?"])
  expect(t.revealed).toEqual([ANCHOR])
  expect(t.notes).toEqual(["Proposed new wording for your comment on src/a.ts:2 — it is open in the thread panel."])
})

test("an unknown id, a comment on GitHub as written, or a second proposal is refused", async () => {
  const t = setup(withComments)
  const answers = await Promise.all([
    t.proposals.proposeEdit("nope", "x"),
    t.proposals.proposeEdit("gh-1", "x"),
  ])
  expect(answers).toEqual([
    "No comment nope; list_comments lists them.",
    "Comment gh-1 is on GitHub as written, not one of the reviewer's own comments; list_comments lists those.",
  ])
  void t.proposals.proposeEdit("local-1", "x")
  expect(await t.proposals.proposeEdit("gh-2", "y")).toBe(BUSY)
})

test("an edit of the comment the reviewer left unsaved is never replaced", async () => {
  const t = setup(withComments, (drafts) => drafts.remember({ editingId: "local-1" }, "half"))
  expect(await t.proposals.proposeEdit("local-1", "x")).toBe(
    "The reviewer has an unsaved edit of the comment on src/a.ts:2; it stays theirs, so nothing opened there.",
  )
})

test("new wording waits while the reviewer writes a comment", () => {
  const t = setup((s) => setInlineCommentInput(openInlineCommentOverlay(withComments(s), "src/a.ts", 1, "RIGHT", "compose"), "mine"))
  void t.proposals.proposeEdit("local-1", "x")
  expect(t.state().inlineCommentOverlay.mode).toBe("compose")
  t.update(cancelInlineComposer)
  t.proposals.check()
  expect(t.state().inlineCommentOverlay.editingId).toBe("local-1")
})

test("saving new wording reports it; a synced comment's says it is staged", async () => {
  const t = setup(withComments)
  const local = t.proposals.proposeEdit("local-1", "Why upper case here?")
  t.update(saveEdit)
  t.proposals.composerSettled("saved")
  expect(await local).toBe("The reviewer saved the new wording on src/a.ts:2: Why upper case here?")

  const staged = t.proposals.proposeEdit("gh-2", "Better staged wording")
  t.update(saveEdit)
  t.proposals.composerSettled("saved")
  expect(await staged).toBe(
    "The reviewer saved the new wording on src/a.ts:1, staged; it reaches GitHub when they push it: Better staged wording",
  )
})

test("saving the comment back as it was says it was kept", async () => {
  const t = setup(withComments)
  const outcome = t.proposals.proposeEdit("local-1", "Why upper case here?")
  t.update((s) => cancelInlineComposer(s))
  t.proposals.composerSettled("saved")
  expect(await outcome).toBe("The reviewer kept the comment as it was.")
})

test("dropping new wording untouched forgets it; edited, it is kept", async () => {
  const t = setup(withComments)
  const untouched = t.proposals.proposeEdit("local-1", "Why upper case here?")
  t.escape()
  t.proposals.composerSettled("dropped")
  expect(await untouched).toBe(DROPPED)
  expect(t.drafts.drafts().size).toBe(0)

  const edited = t.proposals.proposeEdit("local-1", "Why upper case here?")
  t.update((s) => setInlineCommentInput(s, "Mine now"))
  t.escape()
  t.proposals.composerSettled("dropped")
  expect(await edited).toBe(DROPPED)
  expect(t.drafts.on({ editingId: "local-1" })).toBe("Mine now")
})
