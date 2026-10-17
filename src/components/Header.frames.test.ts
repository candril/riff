import { test, expect, describe, afterEach } from "bun:test"
import { mountRenderable } from "../testing/frame"
import { Header, type HeaderProps } from "./Header"
import { mergeReading } from "../utils/merge-verdict"
import type { PrCheck, PrCommit, PrInfo } from "../providers/github"
import type { DiffFile } from "../utils/diff-parser"

/*
 * What the one-row header draws, on a 100-column screen. The branch arrow
 * is its own Text in a row with a gap of two, hence the wide " → ".
 */

const GREET: DiffFile = { filename: "src/greet.ts", additions: 2, deletions: 1, status: "modified", content: "" }

function check(id: number, conclusion: PrCheck["conclusion"]): PrCheck {
  return { id, name: `check ${id}`, status: "completed", conclusion, detailsUrl: null, startedAt: null, completedAt: null }
}

const PR: PrInfo = {
  number: 42,
  title: "Greet by template",
  body: "",
  author: "someone",
  state: "open",
  headRef: "greet",
  baseRef: "main",
  owner: "owner",
  repo: "repo",
  url: "https://github.com/owner/repo/pull/42",
  additions: 2,
  deletions: 1,
  changedFiles: 1,
  checks: [check(1, "success"), check(2, "failure")],
}

const COMMITS: PrCommit[] = [
  { sha: "aaaaaaa", message: "first", author: "someone", date: "2026-01-01T00:00:00Z" },
  { sha: "bbbbbbb", message: "second thing", author: "someone", date: "2026-01-02T00:00:00Z" },
]

const LOCAL: HeaderProps = { branchInfo: "greet → main", totalFiles: 3 }

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

async function frame(props: HeaderProps, width = 100) {
  mounted = await mountRenderable(() => Header(props), { width, height: 1 })
  return mounted.frame()
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

describe("local mode", () => {
  test("names the branches and, with no file selected, counts all files", async () => {
    expect(await frame(LOCAL)).toBe(" riff  greet   →   main  All files (3)")
  })

  test("a selected file is named on the left and its line counts sit on the right", async () => {
    expect(await frame({ ...LOCAL, selectedFile: GREET })).toBe(
      " riff  greet   →   main  src/greet.ts                                                         +2 -1"
    )
  })

  test("review progress counts the outdated files too", async () => {
    expect(await frame({ ...LOCAL, reviewProgress: { reviewed: 1, total: 3, outdated: 1 } })).toBe(
      " riff  greet   →   main  All files (3)                                    1/3 reviewed (1 outdated)"
    )
  })

  test("one commit of several is named as a mode, with its position and the way out", async () => {
    expect(await frame({ ...LOCAL, commits: COMMITS, viewingCommit: "bbbbbbb" })).toBe(
      " riff  greet   →   main  commit 2/2 · bbbbbbb second thing · esc: all commits  All files (3)"
    )
  })

  // The time itself is in the machine's locale and timezone.
  test("a known refresh time is marked", async () => {
    expect(await frame({ ...LOCAL, lastRefreshedAt: "2026-01-01T10:00:00Z" })).toContain("↻ ")
  })
})

describe("PR mode", () => {
  test("shows state, number, author and title, then whose move it is and the checks", async () => {
    expect(await frame({
      prInfo: PR,
      totalFiles: 3,
      merge: mergeReading(PR, PR.checks!, []),
      reviewProgress: { reviewed: 1, total: 3 },
      selectedFile: GREET,
    })).toBe(
      " Open #42 @someone Greet by template                     ! checks failing  ✗ 1  1/3 reviewed  +2 -1"
    )
  })

  test("viewing one commit puts the commit where the title was", async () => {
    expect(await frame({ prInfo: PR, totalFiles: 3, commits: COMMITS, viewingCommit: "bbbbbbb" })).toBe(
      " Open #42 @someone commit 2/2 · bbbbbbb second thing · esc: all commits                         ✗ 1"
    )
  })
})

describe("version", () => {
  const VERSION = "9.9.9+test"

  test("sits dimmed at the right end, after the line counts", async () => {
    expect(await frame({ ...LOCAL, selectedFile: GREET, version: VERSION })).toBe(
      " riff  greet   →   main  src/greet.ts                                             +2 -1  9.9.9+test"
    )
  })

  test("in PR mode it follows the long right side and takes nothing from the left", async () => {
    const props: HeaderProps = {
      prInfo: PR,
      totalFiles: 3,
      merge: mergeReading(PR, PR.checks!, []),
      reviewProgress: { reviewed: 1, total: 3 },
      selectedFile: GREET,
    }
    const without = await frame(props)
    await mounted?.dispose()
    const withVersion = await frame({ ...props, version: VERSION })
    // Left 35, right 42: 2 + 35 + 2 + 42 + 2 + 10 = 93 cells, inside 100.
    expect(withVersion).toEndWith("1/3 reviewed  +2 -1  9.9.9+test")
    expect(withVersion).toHaveLength(99)
    const left = " Open #42 @someone Greet by template"
    expect(without).toStartWith(left)
    expect(withVersion).toStartWith(left)
  })

  // The local header with a file selected takes 45 cells, and 57 with the version.
  const SELECTED: HeaderProps = { ...LOCAL, selectedFile: GREET }

  test("is dropped whole when the rest only just fits", async () => {
    for (const width of [45, 56]) {
      const without = await frame(SELECTED, width)
      await mounted?.dispose()
      const withVersion = await frame({ ...SELECTED, version: VERSION }, width)
      await mounted?.dispose()
      mounted = null
      expect(withVersion).toBe(without)
      expect(withVersion).not.toContain("9.9")
      expect(withVersion).not.toContain("+test")
    }
    expect(await frame({ ...SELECTED, version: VERSION }, 57)).toEndWith("+2 -1  9.9.9+test")
  })

  test("goes on a resize to narrow and comes back on a resize to wide", async () => {
    expect(await frame({ ...SELECTED, version: VERSION })).toContain(VERSION)
    mounted!.setup.resize(45, 1)
    const narrow = await mounted!.frame()
    expect(narrow).toBe(" riff  greet   →   main  src/greet.ts  +2 -1")
    mounted!.setup.resize(100, 1)
    expect(await mounted!.frame()).toEndWith("+2 -1  9.9.9+test")
  })
})
