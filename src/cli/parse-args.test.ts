import { test, expect, describe } from "bun:test"
import { parseArgs, type PathKind } from "./args"

/** A filesystem that knows only what a test says it does. */
const fs = (entries: Record<string, PathKind>) => (path: string) => entries[path] ?? null

const noPaths = fs({})

describe("parseArgs", () => {
  test("no argument is the working copy", () => {
    expect(parseArgs([], noPaths)).toEqual({ type: "local" })
  })

  test("a bare number stays a PR, even where a file of that name exists", () => {
    const parsed = parseArgs(["123"], fs({ "123": "file" }))
    expect(parsed.type).toBe("pr")
    expect(parsed.prNumber).toBe(123)
  })

  test("a path that exists beats a revset", () => {
    const parsed = parseArgs(["main"], fs({ main: "directory" }))
    expect(parsed.type).toBe("files")
    expect(parsed.filesTarget).toEqual({ path: "main", directory: true })
  })

  test("a name no path matches is still a revision", () => {
    expect(parseArgs(["main"], noPaths)).toEqual({ target: "main", type: "local" })
    expect(parseArgs(["HEAD~3"], noPaths).type).toBe("local")
  })

  test("a file opens as a file, a directory as a directory", () => {
    expect(parseArgs(["src/app.ts"], fs({ "src/app.ts": "file" })).filesTarget).toEqual({
      path: "src/app.ts",
      directory: false,
    })
    expect(parseArgs(["."], fs({ ".": "directory" })).filesTarget).toEqual({
      path: ".",
      directory: true,
    })
  })

  test("-r forces the revision where both a path and a bookmark exist", () => {
    const both = fs({ main: "directory" })
    expect(parseArgs(["-r", "main"], both)).toEqual({ target: "main", type: "local" })
    expect(parseArgs(["--revision", "main"], both).type).toBe("local")
  })

  test("-r with nothing after it is the working copy, not a crash", () => {
    expect(parseArgs(["-r"], noPaths)).toEqual({ type: "local" })
  })

  test("the PR forms are untouched", () => {
    expect(parseArgs(["gh:facebook/react#1234"], noPaths)).toMatchObject({
      type: "pr",
      owner: "facebook",
      repo: "react",
      prNumber: 1234,
    })
    expect(parseArgs(["pr"], noPaths).type).toBe("pr")
  })
})
