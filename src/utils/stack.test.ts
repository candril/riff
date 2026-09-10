import { test, expect, describe } from "bun:test"
import { readStack, stackText } from "./stack"

const base = { number: 1217, title: "import the register" }
const commits = [{ sha: "dea3224" }, { sha: "9bcc45d" }]

describe("a PR stacked on another", () => {
  test("nothing to say beyond the base while the base has not moved", () => {
    const stack = readStack(base, { behindBy: 0, mergeBase: "9bcc45d81a" }, commits)
    expect(stack.status).toBe("current")
    expect(stackText(stack)).toBe("stacked on #1217 import the register")
  })

  test("a base that grew is still the diff's base — merely moved", () => {
    const stack = readStack(base, { behindBy: 2, mergeBase: "dea3224ff" }, commits)
    expect(stack.status).toBe("moved")
    expect(stackText(stack)).toContain("moved on by 2 commits")
  })

  test("a base whose history lost the branch point was rewritten", () => {
    const stack = readStack(base, { behindBy: 15, mergeBase: "7bcc11f00" }, commits)
    expect(stack.status).toBe("rewritten")
    expect(stackText(stack)).toContain("rewritten since you branched — rebase")
  })
})
