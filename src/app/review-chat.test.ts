import { expect, test } from "bun:test"
import { createInitialState } from "../state"
import { createReviewChat, reviewAgent } from "./review-chat"

const deps = (demo: boolean) => ({
  demo,
  getState: () => createInitialState([], [], "local", ""),
  target: undefined,
  headSha: () => null,
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

test("a failing check leaves the chat empty", async () => {
  const review = createReviewChat({ ...deps(false), claudeVersion: () => Promise.reject(new Error("boom")) })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(review.entries).toEqual([])
})
