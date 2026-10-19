import { test, expect, afterEach } from "bun:test"
import { createFileTreeIsland, type FileTreeInput, type FileTreeIsland } from "./file-tree"
import { bgAt, ints, mountRenderable } from "../testing/frame"
import { theme } from "../theme"
import { parseDiff, sortFiles } from "../utils/diff-parser"
import { buildFileTree, toggleNodeExpansion } from "../utils/file-tree"

const modified = (path: string) => `diff --git a/${path} b/${path}
index 1111111..2222222 100644
--- a/${path}
+++ b/${path}
@@ -1,1 +1,1 @@
-a
+b
`

const LONG = "src/features/a-rather-long-directory-name/component-with-a-long-name.ts"
const FILES = sortFiles(parseDiff([LONG, "src/app/main.ts", "src/app/old.ts", "package-lock.json", "README.md"].map(modified).join("")))
const TREE = buildFileTree(FILES)

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

async function mountIsland(input: Partial<FileTreeInput>, { width = 35, height = 12 } = {}) {
  let tree!: FileTreeIsland
  mounted = await mountRenderable((renderer) => {
    tree = createFileTreeIsland(renderer, { width: 35 })
    return tree.host
  }, { width, height })
  const push = (over: Partial<FileTreeInput> = {}) =>
    tree.update({ files: FILES, fileTree: TREE, highlightIndex: 0, selectedFileIndex: null, focused: true, ...input, ...over })
  push()
  return { tree, push, frame: () => mounted!.frame(), setup: mounted.setup }
}

test("a resize re-truncates the labels and keeps the hidden-count line below every file row", async () => {
  const { tree, frame } = await mountIsland(
    { ignoredFiles: new Set(["package-lock.json"]), showHiddenFiles: false },
    { width: 50 }
  )
  const narrow = (await frame()).split("\n")
  expect(narrow.at(-1)).toBe("  (+1 hidden)")
  expect(narrow.join("\n")).toContain("…")

  tree.setWidth(50)
  const wide = (await frame()).split("\n")
  expect(wide.at(-1)).toBe("  (+1 hidden)")
  expect(wide.filter((row) => row.includes("hidden"))).toHaveLength(1)
  expect(wide.some((row) => row.includes("component-with-a-long-name.ts"))).toBe(true)
  expect(wide.join("\n")).not.toContain("package-lock.json")
})

test("one push after a fold draws the folded directory's dot and caret in the very next frame", async () => {
  const marks = { unseenFiles: new Set(["src/app/main.ts"]), changedSinceVisit: new Set(["src/app/old.ts"]) }
  const { push, frame } = await mountIsland(marks)
  expect(await frame()).toContain("▼ app ● ▴")

  push({ ...marks, fileTree: toggleNodeExpansion(TREE, "src/app") })
  const rows = (await frame()).split("\n")
  expect(rows.some((row) => row.includes("▶ app ● ▴"))).toBe(true)
  expect(rows.some((row) => row.includes("main.ts"))).toBe(false)
})

test("ensureHighlightVisible scrolls a short panel to the highlighted row and back", async () => {
  const { tree, push, frame, setup } = await mountIsland({}, { height: 6 })
  await frame()
  const lastIndex = 7
  push({ highlightIndex: lastIndex })
  tree.ensureHighlightVisible()
  const rows = (await frame()).split("\n")
  const { first, last } = tree.visibleRows()
  expect(first).toBeGreaterThan(0)
  expect(lastIndex).toBeGreaterThanOrEqual(first)
  expect(lastIndex).toBeLessThanOrEqual(last)
  const readme = rows.findIndex((row) => row.includes("README.md"))
  expect(readme).toBeGreaterThan(0)
  expect(bgAt(setup.captureSpans(), rows[readme]!.indexOf("README.md"), readme)).toEqual(ints(theme.surface0))

  push({ highlightIndex: 0 })
  tree.ensureHighlightVisible()
  const top = (await frame()).split("\n")
  expect(tree.visibleRows().first).toBe(0)
  expect(top[1]).toContain("▼ src")
})

test("the filter prompt takes focus with the applied filter, reports typing, and gives the label back", async () => {
  const { tree, push, frame, setup } = await mountIsland({})
  const typed: string[] = []
  tree.setOnFilterChange((value) => typed.push(value))
  const field = setup.renderer.root.findDescendantById("file-tree-filter") as import("@opentui/core").InputRenderable

  push({ treeFilter: "app", treeFilterInput: true })
  expect(field.focused).toBe(true)
  expect(field.value).toBe("app")
  const prompt = (await frame()).split("\n")[0]!
  expect(prompt.trim()).toBe("/app")
  for (let x = 1; x < 34; x++) expect(bgAt(setup.captureSpans(), x, 0)).toEqual(ints(theme.surface0))

  await setup.mockInput.typeText("/m")
  expect(typed.at(-1)).toBe("app/m")

  push({ treeFilter: "app/m", treeFilterInput: true })
  expect(field.focused).toBe(true)
  expect(field.value).toBe("app/m")

  push({ treeFilter: "", treeFilterInput: false })
  expect(field.focused).toBe(false)
  expect((await frame()).split("\n")[0]).toBe("  Files (0/5)")
  expect(bgAt(setup.captureSpans(), 1, 0)).toEqual(ints(theme.mantle))
})
