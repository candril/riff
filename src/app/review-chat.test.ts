import { expect, test } from "bun:test"
import { createInitialState } from "../state"
import { createReadTools } from "../providers/agent/read-tools"
import { createRiffSource } from "../providers/agent/riff-source"
import type { PrInfo } from "../providers/github/types"
import { parseDiff } from "../utils/diff-parser"
import { createReviewChat, reviewAgent, reviewReferences } from "./review-chat"

const deps = (demo: boolean) => ({
  demo,
  getState: () => createInitialState([], [], "local", ""),
  target: undefined,
  headSha: () => null,
  source: "local",
  savedChat: null,
  position: () => null,
  proposer: () => ({ proposeComment: async () => "", proposeEdit: async () => "" }),
})

test("--demo runs on the canned agent, and a review on Claude Opus", () => {
  expect(reviewAgent(deps(true)).model).toBe("demo")
  expect(reviewAgent(deps(false)).model).toBe("claude-opus-5-5")
})

test("a review says a drifted claude in the chat once the check returns; --demo never checks", async () => {
  let checks = 0
  const drift = { text: "claude 2.2.0 is installed", tone: "info" as const }
  const claudeVersion = () => (checks++, Promise.resolve(drift))
  const demo = createReviewChat({ ...deps(true), claudeVersion })
  const review = createReviewChat({ ...deps(false), claudeVersion })
  expect(review.entries).toEqual([])
  await Promise.resolve()
  await Promise.resolve()
  expect(checks).toBe(1)
  expect(demo.entries).toEqual([])
  expect(review.entries).toEqual([{ kind: "note", ...drift }])
})

test("a review picks up its earlier conversation; --demo starts empty", () => {
  const savedChat = {
    sessionId: "s",
    headSha: null,
    entries: [{ kind: "question" as const, text: "why?", labels: [] }],
  }
  const claudeVersion = () => Promise.resolve(null)
  const demo = createReviewChat({ ...deps(true), savedChat })
  const review = createReviewChat({ ...deps(false), savedChat, claudeVersion })
  expect(demo.entries).toEqual([])
  expect(review.entries.map((e) => e.text)).toEqual(["why?"])
})

test("a failing check leaves the chat empty", async () => {
  const review = createReviewChat({ ...deps(false), claudeVersion: () => Promise.reject(new Error("boom")) })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(review.entries).toEqual([])
})

test("@pr's footer sends list_files to the first file its attachment left out, with ignored files among them", async () => {
  const diff = Array.from(
    { length: 450 },
    (_, i) => `diff --git a/f${i}.ts b/f${i}.ts\nnew file mode 100644\n--- /dev/null\n+++ b/f${i}.ts\n@@ -0,0 +1,1 @@\n+x\n`,
  ).join("")
  const files = parseDiff(diff)
  const state = {
    ...createInitialState(files, [], "pr", ""),
    prInfo: { number: 7, title: "Many files", body: "Why.", owner: "o", repo: "r" } as PrInfo,
    ignoredFiles: new Set(["f3.ts", "f100.ts", "f200.ts", "f420.ts"]),
  }
  const result = reviewReferences(() => state)("@pr", null)
  if (!("attachments" in result)) throw new Error(result.error)
  const lines = result.attachments[0]!.split("\n")
  const offset = Number(lines.at(-1)!.match(/list_files offset=(\d+)/)![1])
  const lastShown = lines.at(-2)!.split(" ")[1]
  const source = createRiffSource({ state: () => state, target: undefined, headSha: () => null })
  const listed = (await createReadTools(source, () => {}).listFiles(undefined, offset)).text.split("\n")
  const visible = files.map((f) => f.filename).filter((name) => !state.ignoredFiles.has(name))
  expect(listed[0]).toBe(`added ${visible[visible.indexOf(lastShown!) + 1]} (+1 -0)`)
})
