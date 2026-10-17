import { test, expect, describe, afterEach } from "bun:test"
import { bgAt, ints, mountRenderable } from "../testing/frame"
import { theme } from "../theme"
import { commentsPickerModel } from "./comments-picker-model"
import { createCommentsPickerIsland } from "../app/pickers"
import type { CommentsPickerEntry } from "../features/comments-picker/filter"
import type { Comment } from "../types"

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

async function frame(entries: CommentsPickerEntry[], selectedIndex = 0, height = 24) {
  mounted = await mountRenderable(
    (renderer) => {
      const island = createCommentsPickerIsland(renderer)
      island.update(commentsPickerModel(entries, selectedIndex, height))
      return island.host
    },
    { width: 100, height }
  )
  return (await mounted.frame()).split("\n")
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

function entry(
  filename: string,
  line: number,
  preview: string,
  extra: Partial<Comment> & { isRoot?: boolean; threadResolved?: boolean } = {}
): CommentsPickerEntry {
  const { isRoot = true, threadResolved = false, ...comment } = extra
  return {
    comment: {
      id: `${filename}:${line}`,
      filename,
      line,
      side: "RIGHT",
      body: preview,
      createdAt: "2026-10-17T00:00:00Z",
      status: "local",
      ...comment,
    },
    preview,
    isRoot,
    threadResolved,
  }
}

const ENTRIES: CommentsPickerEntry[] = [
  entry("src/greet.ts", 12, "rename this", { status: "local" }),
  entry("src/greet.ts", 14, "agreed", { status: "synced", author: "octocat", isRoot: false }),
  entry("src/main.ts", 3, "done already", { status: "synced", author: "hubot", threadResolved: true }),
  entry("README.md", 1, "typo", { status: "pending" }),
]

const MANY: CommentsPickerEntry[] = Array.from({ length: 30 }, (_, i) => entry(`src/f${i}.ts`, i + 1, `note ${i}`))

describe("the comments picker", () => {
  test("titles itself with the count, seven tenths of the screen wide in the middle", async () => {
    const lines = await frame(ENTRIES, 1)
    const title = lines.find((l) => l.includes("Find Comments"))!
    expect(title).toMatch(/Find Comments\s+2\/4  esc$/)
    expect(title.indexOf("Find Comments")).toBe(17)
    expect(title.length).toBe(83)
  })

  test("lists each comment with its status, place, preview and author", async () => {
    const lines = await frame(ENTRIES, 1)
    expect(lines.some((l) => /●  src\/greet\.ts:12 rename this$/.test(l))).toBe(true)
    expect(lines.some((l) => /↳  src\/greet\.ts:14 agreed\s+@octocat$/.test(l))).toBe(true)
    expect(lines.some((l) => /✓  src\/main\.ts:3 done already\s+@hubot$/.test(l))).toBe(true)
    expect(lines.some((l) => /○  README\.md:1 typo$/.test(l))).toBe(true)
  })

  test("shades the selected row and the field surface0 on the picker's mantle", async () => {
    const rows = await frame(ENTRIES, 1)
    const spans = mounted!.setup.captureSpans()
    const selected = rows.findIndex((l) => l.includes(":14 agreed"))
    const other = rows.findIndex((l) => l.includes("rename this"))
    const field = rows.findIndex((l) => l.includes("Find Comments")) + 2
    const x = rows[selected]!.indexOf("src")
    expect(bgAt(spans, x, selected)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, x, other)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, x, field)).toEqual(ints(theme.surface0))
  })

  test("past twenty comments, shows the window around the selection and how many lie beyond it", async () => {
    // Tall enough for all twenty rows and both notes, which 24 rows cut short.
    const text = (await frame(MANY, 15, 34)).join("\n")
    expect(text).toMatch(/Find Comments\s+16\/30  esc/)
    expect(text).toContain("↑ 5 more")
    expect(text).toContain("↓ 5 more")
    expect(text).toContain("src/f5.ts:6")
    expect(text).toContain("src/f24.ts:25")
    expect(text).not.toContain("src/f4.ts:5")
    expect(text).not.toContain("src/f25.ts:26")
  })

  test("with nothing to show, counts 0 and says so", async () => {
    const lines = await frame([])
    expect(lines.find((l) => l.includes("Find Comments"))).toMatch(/Find Comments\s+0  esc$/)
    expect(lines.some((l) => l.trim() === "No comments")).toBe(true)
  })
})
