import { test, expect, describe } from "bun:test"
import { diffCommand } from "./editor"

describe("the configured diff command", () => {
  test("puts the two paths where the template says", () => {
    expect(diffCommand("nvim -d {old} {new}", "/tmp/old.ts", "src/a.ts")).toEqual([
      "nvim",
      "-d",
      "/tmp/old.ts",
      "src/a.ts",
    ])
  })

  test("a path is one argument, spaces and all — there is nothing to quote", () => {
    expect(diffCommand("code --diff {old} {new}", "/tmp/my old.ts", "src/a b.ts")).toEqual([
      "code",
      "--diff",
      "/tmp/my old.ts",
      "src/a b.ts",
    ])
  })

  test("a template that names neither path still runs", () => {
    expect(diffCommand("  difft  ", "/tmp/o", "/tmp/n")).toEqual(["difft"])
  })
})
