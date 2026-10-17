import { test, expect, describe, afterEach } from "bun:test"
import { bgAt, ints, mountRenderable } from "../testing/frame"
import { theme } from "../theme"
import type { FilteredFile } from "./FilePicker"
import { filePickerModel } from "./file-picker-model"
import { createFilePickerIsland } from "../app/pickers"
import type { DiffFile } from "../utils/diff-parser"

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

async function frame(files: FilteredFile[], selectedIndex = 0, height = 24, width = 100) {
  mounted = await mountRenderable(
    (renderer) => {
      const island = createFilePickerIsland(renderer)
      island.update(filePickerModel(files, selectedIndex, height))
      return island.host
    },
    { width, height }
  )
  return (await mounted.frame()).split("\n")
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

function file(filename: string, additions = 1, deletions = 0): DiffFile {
  return { filename, additions, deletions, status: "modified", content: "" }
}

const FILES: FilteredFile[] = [
  { file: file("src/greet.ts", 12, 3), index: 0, viewed: true },
  { file: file("src/main.ts", 4, 0), index: 1, commentCount: 2 },
  { file: file("README.md", 0, 7), index: 2 },
]

const MANY: FilteredFile[] = Array.from({ length: 30 }, (_, i) => ({ file: file(`src/file-${i}.ts`), index: i }))

describe("the file picker", () => {
  test("titles itself with the count, half the screen wide in the middle", async () => {
    const lines = await frame(FILES, 1)
    const title = lines.find((l) => l.includes("Find Files"))!
    expect(title).toMatch(/Find Files\s+2\/3  esc$/)
    expect(title.indexOf("Find Files")).toBe(27)
    expect(title.length).toBe(73)
  })

  test("lists each file with its viewed tick, comment count and line stats", async () => {
    const lines = await frame(FILES, 1)
    expect(lines.some((l) => /✓ src\/greet\.ts\s+\+12 -3/.test(l))).toBe(true)
    expect(lines.some((l) => /  src\/main\.ts\s+2 \+4 -0/.test(l))).toBe(true)
    expect(lines.some((l) => /  README\.md\s+\+0 -7/.test(l))).toBe(true)
  })

  test("shades the selected row and the field surface0 on the picker's mantle", async () => {
    const rows = await frame(FILES, 1)
    const spans = mounted!.setup.captureSpans()
    const selected = rows.findIndex((l) => l.includes("src/main.ts"))
    const other = rows.findIndex((l) => l.includes("src/greet.ts"))
    const field = rows.findIndex((l) => l.includes("Find Files")) + 2
    const x = rows[selected]!.indexOf("src")
    expect(bgAt(spans, x, selected)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, x, other)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, x, field)).toEqual(ints(theme.surface0))
  })

  test("past twenty files, shows the window around the selection and how many lie beyond it", async () => {
    // Tall enough for all twenty rows and both notes, which 24 rows cut short.
    const lines = await frame(MANY, 15, 34)
    const text = lines.join("\n")
    expect(text).toMatch(/Find Files\s+16\/30  esc/)
    expect(text).toContain("↑ 5 more")
    expect(text).toContain("↓ 5 more")
    expect(text).toContain("src/file-5.ts")
    expect(text).toContain("src/file-24.ts")
    expect(text).not.toContain("src/file-4.ts")
    expect(text).not.toContain("src/file-25.ts")
  })

  test("on a 24-row terminal, shortens the window so its notes and the panel's last row stay on screen", async () => {
    const files = Array.from({ length: 50 }, (_, i) => ({ file: file(`src/file-${i}.ts`), index: i }))
    for (const selected of [0, 25]) {
      const lines = await frame(files, selected, 24, 80)
      const spans = mounted!.setup.captureSpans()
      const below = lines.findIndex((l) => /↓ \d+ more/.test(l))
      expect(below).toBeGreaterThan(0)
      expect(lines.some((l) => /↑ \d+ more/.test(l))).toBe(selected > 0)
      expect(below + 1).toBeLessThan(24)
      expect(bgAt(spans, 20, below + 1)).toEqual(ints(theme.mantle))
      await mounted!.dispose()
      mounted = null
    }
  })

  test("with nothing to show, counts 0", async () => {
    expect((await frame([])).find((l) => l.includes("Find Files"))).toMatch(/Find Files\s+0  esc$/)
  })
})
