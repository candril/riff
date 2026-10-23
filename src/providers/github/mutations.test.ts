import { describe, expect, test } from "bun:test"
import { readyCommand } from "./mutations"

describe("gh pr ready's arguments", () => {
  test("marking ready carries no --undo", () => {
    expect(readyCommand("owner", "repo", 12, false)).toEqual(["gh", "pr", "ready", "12", "-R", "owner/repo"])
  })

  test("back to draft carries --undo", () => {
    expect(readyCommand("owner", "repo", 12, true)).toEqual(["gh", "pr", "ready", "12", "-R", "owner/repo", "--undo"])
  })
})
