import { expect, test } from "bun:test"
import { MAX_LISTED_FILES, buildContext } from "./prompt"
import type { AgentFile, AgentTarget } from "./target"

const pr: AgentTarget = {
  kind: "pr",
  owner: "o",
  repo: "r",
  number: 7,
  title: "Add a store",
  state: "open",
  author: "someone",
  description: "Moves storage behind an interface.",
}

const files = (n: number): AgentFile[] =>
  Array.from({ length: n }, (_, i) => ({
    path: `${i % 2 ? "src" : "docs"}/f${i}.ts`,
    status: "added",
    additions: 3,
    deletions: 0,
  }))

test("a PR heading holds the title, ref, state and description, then the files with counts", () => {
  const context = buildContext(pr, files(2), 0)
  expect(context).toContain("# Add a store\no/r#7 · open")
  expect(context).toContain("## Description\nMoves storage behind an interface.")
  expect(context).toContain("## Changed files\nadded docs/f0.ts (+3 -0)\nadded src/f1.ts (+3 -0)")
})

test("a PR without a description says so", () => {
  const context = buildContext({ ...pr, description: "  " }, files(1), 0)
  expect(context).toContain("## Description\n(none)")
})

test("local changes name the revision under review", () => {
  const context = buildContext(
    { kind: "local", label: "feature → main", description: "Changes since trunk" },
    files(1),
    0,
  )
  expect(context).toContain(
    "# Local changes\nUnder review: the reviewer's own local changes on feature → main (Changes since trunk); there is no PR.",
  )
  expect(context).not.toContain("## Description")
})

test("an empty local description leaves the parentheses out", () => {
  const context = buildContext({ kind: "local", label: null, description: " " }, files(1), 0)
  expect(context).toContain("Under review: the reviewer's own local changes; there is no PR.")
})

test("files hidden by the reviewer's ignore patterns are counted after the listing", () => {
  expect(buildContext(pr, files(1), 2)).toContain(
    "added docs/f0.ts (+3 -0)\n2 more files hidden by the reviewer's ignore patterns; read_diff reads them by path",
  )
  expect(buildContext(pr, files(1), 0)).not.toContain("hidden")
})

test(`over ${MAX_LISTED_FILES} files lists directories with counts instead`, () => {
  const context = buildContext(pr, files(MAX_LISTED_FILES + 1), 0)
  expect(context).toContain("301 files changed, too many to list.")
  expect(context).toContain("docs/ (151 files)\nsrc/ (150 files)")
  expect(context).not.toContain("docs/f0.ts")
})

test("the length reminder comes last, and only riff's P1 tools are named", () => {
  const context = buildContext(pr, files(1), 0)
  expect(
    context.endsWith(
      "Answer in under ten lines, and draft comments as one direct sentence, unless the reviewer asks for more.",
    ),
  ).toBe(true)
  expect(context).toContain("propose_comment or propose_edit, one at a time")
  expect(context).not.toContain("propose_review")
  expect(context).not.toContain("open_target")
  expect(context).not.toContain("list_drafts")
})

test("the posture names the tool for the PR's conversation", () => {
  expect(buildContext(pr, files(1), 0)).toContain("read_conversation for the PR's conversation")
})

test("the posture says what the attached threads are and what 'this thread' means", () => {
  const context = buildContext(pr, files(1), 0)
  // Sentences, not the wrap: a reflow of the prompt is no change to it.
  const prose = context.replace(/\s+/g, " ")
  expect(prose).toContain("A question may carry [Thread …] blocks")
  expect(prose).toContain('"This thread" and "this comment" mean those;')
  expect(prose).toContain("a thread on a whole file reads as `path (file)`.")
})

test("the posture holds the drafting rules", () => {
  const prose = buildContext(pr, files(1), 0).replace(/\s+/g, " ")
  expect(prose).toContain("A draft is one sentence where one is enough, two at most")
  expect(prose).toContain("an imperative or a plain statement, never a request or a question")
  expect(prose).toContain('no "Could you", "Would you mind" or "Maybe"')
  expect(prose).toContain("No please, thanks, greeting, praise, hedging or summary.")
  expect(prose).toContain("No justification or background, such as why it works or language trivia, unless the reviewer asked for it.")
  expect(prose).toContain("in a suggestion block or a `path:line` reference, never described in words")
  expect(prose).toContain("Claim nothing about code you have not read")
  expect(prose).toContain("invent no rationale")
  expect(prose).toContain("state no guess as fact")
  expect(prose).toContain("If unsure, ask the reviewer instead of drafting.")
  expect(prose).toContain("Longer only when the reviewer asks for it in that question.")
})

test("the posture shows a bad and a good draft", () => {
  const context = buildContext(pr, files(1), 0)
  expect(context).toContain(
    "  Bad: Could you move `resolveRedirect` below the `describe` block, so the file starts with the\n       test cases? A `function` declaration is hoisted, so it still works when defined at the\n       bottom.\n  Good: Move `resolveRedirect` below the `describe` block so the file starts with the tests.",
  )
})
