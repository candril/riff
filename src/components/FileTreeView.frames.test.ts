import { test, expect, describe, afterEach } from "bun:test"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { colors, theme } from "../theme"
import { createFileTreeIsland, type FileTreeIsland } from "../app/file-tree"
import { parseDiff, sortFiles } from "../utils/diff-parser"
import { buildFileTree, toggleNodeExpansion, type FileTreeNode } from "../utils/file-tree"
import type { FileReviewStatus } from "../types"

/*
 * What the file tree panel draws at the app's default width of 35. Colours
 * and backgrounds are not in a char frame: the cursor row and the file you
 * are in read like any other row there, so "shades" checks them by span.
 */

const RAW = `diff --git a/src/app/main.ts b/src/app/main.ts
index 1111111..2222222 100644
--- a/src/app/main.ts
+++ b/src/app/main.ts
@@ -1,2 +1,2 @@
 const a = 1
-const b = 2
+const b = 3
diff --git a/src/app/old.ts b/src/app/old.ts
deleted file mode 100644
index 3333333..0000000
--- a/src/app/old.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-export const old = 1
diff --git a/src/utils/foo.ts b/src/utils/foo.ts
new file mode 100644
index 0000000..4444444
--- /dev/null
+++ b/src/utils/foo.ts
@@ -0,0 +1,1 @@
+export const foo = 1
diff --git a/docs/guide.md b/docs/manual.md
similarity index 90%
rename from docs/guide.md
rename to docs/manual.md
index 5555555..6666666 100644
--- a/docs/guide.md
+++ b/docs/manual.md
@@ -1,1 +1,1 @@
-# Guide
+# Manual
diff --git a/README.md b/README.md
index 7777777..8888888 100644
--- a/README.md
+++ b/README.md
@@ -1,1 +1,1 @@
-old
+new
`

const FILES = sortFiles(parseDiff(RAW))
const TREE = buildFileTree(FILES)

interface TreeState {
  fileTree: FileTreeNode[]
  treeHighlightIndex: number
  focused: boolean
  fileStatuses: Map<string, FileReviewStatus>
  treeFilter: string
  treeFilterInput: boolean
  selectedFileIndex: number | null
  multiSelectedFilenames: Set<string>
  unseenFiles: Set<string>
  changedSinceVisit: Set<string>
}

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

/** The panel as app.ts refreshFileTreePanel feeds it, with `state` over a fresh tree. */
async function mountTree(state: Partial<TreeState> = {}) {
  const s: TreeState = {
    fileTree: TREE,
    treeHighlightIndex: 0,
    focused: true,
    fileStatuses: new Map(),
    treeFilter: "",
    treeFilterInput: false,
    selectedFileIndex: null,
    multiSelectedFilenames: new Set(),
    unseenFiles: new Set(),
    changedSinceVisit: new Set(),
    ...state,
  }
  let tree!: FileTreeIsland
  mounted = await mountRenderable((renderer) => {
    tree = createFileTreeIsland(renderer, { width: 35 })
    return tree.host
  }, { width: 35, height: 12 })
  tree.update({
    files: FILES,
    fileTree: s.fileTree,
    highlightIndex: s.treeHighlightIndex,
    selectedFileIndex: s.selectedFileIndex,
    focused: s.focused,
    fileStatuses: s.fileStatuses,
    multiSelectedFilenames: s.multiSelectedFilenames,
    treeFilter: s.treeFilter,
    treeFilterInput: s.treeFilterInput,
    unseenFiles: s.unseenFiles,
    changedSinceVisit: s.changedSinceVisit,
  })
  const text = await mounted.frame()
  return { text, rows: text.split("\n"), spans: mounted.setup.captureSpans() }
}

async function frame(state: Partial<TreeState> = {}) {
  return (await mountTree(state)).text
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const FULL_TREE = `  Files (0/5)
 ○   ▼ docs
 ○ R     manual.md
 ○   ▼ src
 ○     ▼ app
 ○ M       main.ts
 ○ D       old.ts
 ○     ▼ utils
 ○ A       foo.ts
 ○ M   README.md`

describe("the tree", () => {
  test("nests directories over their files, each file with its A/M/D/R letter", async () => {
    expect(await frame()).toBe(FULL_TREE)
  })

  test("the cursor on a file, with the tree focused, adds no characters", async () => {
    expect(await frame({ treeHighlightIndex: 4, focused: true })).toBe(FULL_TREE)
  })

  test("nor does the file you are in, with the diff focused", async () => {
    expect(await frame({ treeHighlightIndex: 4, focused: false })).toBe(FULL_TREE)
  })

  test("a folded directory hides what is under it", async () => {
    expect(await frame({ fileTree: toggleNodeExpansion(TREE, "src/app") })).toBe(`  Files (0/5)
 ○   ▼ docs
 ○ R     manual.md
 ○   ▼ src
 ○     ▶ app
 ○     ▼ utils
 ○ A       foo.ts
 ○ M   README.md`)
  })

  test("a filter narrows the rows to the matches and their directories, and heads the panel", async () => {
    expect(await frame({ treeFilter: "foo" })).toBe(`  /foo
 ○   ▼ src
 ○     ▼ utils
 ○ A       foo.ts`)
  })
})

describe("marks", () => {
  test("viewed files are ticked, stale or not, their directories half-filled, and the header counts them", async () => {
    const fileStatuses = new Map<string, FileReviewStatus>([
      ["src/app/main.ts", { filename: "src/app/main.ts", viewed: true }],
      ["README.md", { filename: "README.md", viewed: true, isStale: true }],
    ])
    expect(await frame({ fileStatuses, focused: false })).toBe(`  Files (2/5)
 ○   ▼ docs
 ○ R     manual.md
 ◐   ▼ src
 ◐     ▼ app
 ✓ M       main.ts
 ○ D       old.ts
 ○     ▼ utils
 ○ A       foo.ts
 ✓ M   README.md`)
  })

  test("a dot follows unseen comments up the tree, a caret marks content changed since the last visit", async () => {
    expect(await frame({
      focused: false,
      unseenFiles: new Set(["src/app/main.ts"]),
      changedSinceVisit: new Set(["README.md"]),
    })).toBe(`  Files (0/5)
 ○   ▼ docs
 ○ R     manual.md
 ○   ▼ src ●
 ○     ▼ app ●
 ○ M       main.ts ●
 ○ D       old.ts
 ○     ▼ utils
 ○ A       foo.ts
 ○ M   README.md ▴`)
  })
})

const WIDTH = 35
const BORDER_GLYPHS = /[┌┐└┘│─]/

describe("shades", () => {
  const rowOf = (rows: string[], text: string) => rows.findIndex((row) => row.includes(text))

  test("the panel sits on mantle, padding and empty cells alike, with no border glyph anywhere", async () => {
    const { text, rows, spans } = await mountTree({ treeHighlightIndex: 0 })
    const readme = rowOf(rows, "README.md")
    expect(bgAt(spans, 0, readme)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, rows[readme]!.indexOf("README.md") + "README.md".length + 2, readme)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, 0, 0)).toEqual(ints(theme.mantle))
    expect(text).not.toMatch(BORDER_GLYPHS)
  })

  test("focused, the cursor row is surface0 across its width and the rest stay mantle", async () => {
    const { rows, spans } = await mountTree({ treeHighlightIndex: 2, focused: true })
    const cursor = rowOf(rows, "▼ src")
    for (let x = 1; x < WIDTH - 2; x++) expect(bgAt(spans, x, cursor)).toEqual(ints(theme.surface0))
    const other = rowOf(rows, "manual.md")
    expect(bgAt(spans, rows[other]!.indexOf("manual.md"), other)).toEqual(ints(theme.mantle))
  })

  test("unfocused, the file you are in keeps the mantle and is named in the accent colour", async () => {
    const selectedFileIndex = FILES.findIndex((file) => file.filename === "README.md")
    const { rows, spans } = await mountTree({ treeHighlightIndex: 0, focused: false, selectedFileIndex })
    const readme = rowOf(rows, "README.md")
    const name = rows[readme]!.indexOf("README.md")
    expect(bgAt(spans, name, readme)).toEqual(ints(theme.mantle))
    expect(fgAt(spans, name, readme)).toEqual(ints(colors.primary))
  })

  test("a V-mode range is surface0 on each of its rows", async () => {
    const { rows, spans } = await mountTree({
      treeHighlightIndex: 0,
      focused: true,
      multiSelectedFilenames: new Set(["src/app/main.ts", "src/app/old.ts"]),
    })
    for (const name of ["main.ts", "old.ts"]) {
      const y = rowOf(rows, name)
      expect(bgAt(spans, rows[y]!.indexOf(name), y)).toEqual(ints(theme.surface0))
    }
    const outside = rowOf(rows, "foo.ts")
    expect(bgAt(spans, rows[outside]!.indexOf("foo.ts"), outside)).toEqual(ints(theme.mantle))
  })

  test("while the filter prompt is open, the header row is surface0", async () => {
    const { text, spans } = await mountTree({ treeFilterInput: true })
    for (let x = 1; x < WIDTH - 1; x++) expect(bgAt(spans, x, 0)).toEqual(ints(theme.surface0))
    expect(text).not.toMatch(BORDER_GLYPHS)
  })
})
