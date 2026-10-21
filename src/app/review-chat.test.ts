import { expect, test } from "bun:test"
import { createInitialState } from "../state"
import { reviewAgent } from "./review-chat"

const deps = (demo: boolean) => ({
  demo,
  getState: () => createInitialState([], [], "local", ""),
  target: undefined,
  headSha: () => null,
  position: () => null,
})

test("--demo runs on the canned agent, and a review on Claude Opus", () => {
  expect(reviewAgent(deps(true)).model).toBe("demo")
  expect(reviewAgent(deps(false)).model).toBe("claude-opus-5-5")
})
