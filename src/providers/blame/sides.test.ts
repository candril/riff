import { expect, test } from "bun:test"
import type { GitBase } from "../git-target"
import { blameSideOf, gitSide, jjSide, prSide } from "./sides"

test("a removed line is blamed on the base side, any other on the head", () => {
  expect(blameSideOf("deletion")).toBe("base")
  expect(blameSideOf("addition")).toBe("head")
  expect(blameSideOf("context")).toBe("head")
})

test.each([
  ["no target", undefined, { rev: "@", live: true }, { rev: "trunk()", live: false }],
  ["a revision", "xyz", { rev: "xyz", live: false }, { rev: "xyz-", live: false }],
  ["another workspace's working copy", "agent@", { rev: "agent@", live: true }, { rev: "trunk()", live: false }],
])("jj, %s", (_, target, head, base) => {
  expect(jjSide("head", target)).toEqual({ tool: "jj", ...head })
  expect(jjSide("base", target)).toEqual({ tool: "jj", ...base })
})

test.each<[string, string | undefined, GitBase | null, GitBase]>([
  ["no target", undefined, null, { rev: "HEAD" }],
  ["branch:main", "branch:main", { rev: "HEAD" }, { mergeBaseOf: ["main", "HEAD"] }],
  ["a...b", "a...b", { rev: "b" }, { mergeBaseOf: ["a", "b"] }],
  ["a..b", "a..b", { rev: "b" }, { rev: "a" }],
  ["a single revision", "abc", { rev: "abc" }, { rev: "abc^" }],
])("git, %s", (_, target, head, base) => {
  expect(gitSide("head", target)).toEqual({ tool: "git", rev: head, live: target === undefined })
  expect(gitSide("base", target)).toEqual({ tool: "git", rev: base, live: false })
})

test("a PR's head is its head commit, its base where it last met the base branch", () => {
  expect(prSide("head", "main", "abc")).toEqual({ tool: "github", rev: { commit: "abc" }, live: false })
  expect(prSide("base", "main", "abc")).toEqual({ tool: "github", rev: { mergeBaseOf: ["main", "abc"] }, live: false })
})
