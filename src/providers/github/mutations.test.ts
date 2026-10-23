import { describe, expect, test } from "bun:test"
import { mergeCommand, readyCommand, updateBranchCommand } from "./mutations"

describe("gh pr ready's arguments", () => {
  test("marking ready carries no --undo", () => {
    expect(readyCommand("owner", "repo", 12, false)).toEqual(["gh", "pr", "ready", "12", "-R", "owner/repo"])
  })

  test("back to draft carries --undo", () => {
    expect(readyCommand("owner", "repo", 12, true)).toEqual(["gh", "pr", "ready", "12", "-R", "owner/repo", "--undo"])
  })
})

describe("gh pr merge's arguments", () => {
  const base = ["gh", "pr", "merge", "12", "-R", "owner/repo"]

  test.each(["squash", "merge", "rebase"] as const)("--%s names the method and nothing else", (method) => {
    expect(mergeCommand("owner", "repo", 12, { method, deleteBranch: false, admin: false })).toEqual([...base, `--${method}`])
  })

  test("deleting the branch and the admin override each add their flag", () => {
    expect(mergeCommand("owner", "repo", 12, { method: "squash", deleteBranch: true, admin: true })).toEqual([
      ...base, "--squash", "--delete-branch", "--admin",
    ])
  })
})

describe("gh pr update-branch's arguments", () => {
  test("a merge from the base carries no flag", () => {
    expect(updateBranchCommand("owner", "repo", 12, "merge")).toEqual(["gh", "pr", "update-branch", "12", "-R", "owner/repo"])
  })

  test("a rebase onto the base carries --rebase", () => {
    expect(updateBranchCommand("owner", "repo", 12, "rebase")).toEqual(["gh", "pr", "update-branch", "12", "-R", "owner/repo", "--rebase"])
  })
})
