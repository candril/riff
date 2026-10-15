import { test, expect, describe, afterEach } from "bun:test"
import { mountRenderable } from "../testing/frame"
import { FileTreePanel } from "./FileTreePanel"
import { parseDiff, sortFiles } from "../utils/diff-parser"
import { buildFileTree, toggleNodeExpansion, type FileTreeNode } from "../utils/file-tree"
import type { FileReviewStatus } from "../types"

/*
 * What the file tree panel draws at the app's default width of 35. Colours
 * and backgrounds are not in a char frame: the cursor row and the file you
 * are in read like any other row here.
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
  unseenFiles: Set<string>
  changedSinceVisit: Set<string>
}

const NOTHING_IGNORED = new Set<string>()
const NOTHING_COLLAPSED = new Set<string>()

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

/** The panel as app.ts refreshFileTreePanel feeds it, with `state` over a fresh tree. */
async function frame(state: Partial<TreeState> = {}) {
  const s: TreeState = {
    fileTree: TREE,
    treeHighlightIndex: 0,
    focused: true,
    fileStatuses: new Map(),
    treeFilter: "",
    unseenFiles: new Set(),
    changedSinceVisit: new Set(),
    ...state,
  }
  let panel!: FileTreePanel
  mounted = await mountRenderable((renderer) => {
    panel = new FileTreePanel({ renderer, width: 35 })
    return panel.getContainer()
  }, { width: 35, height: 12 })

  // The app pushes state on every render. A push that changes the tree's
  // structure rebuilds the rows without the since-last-visit marks, and only
  // the next one draws them, so one push would pin a frame the user never
  // sees for longer than a render.
  for (let push = 0; push < 2; push++) {
    panel.update(
      FILES,
      s.fileTree,
      s.treeHighlightIndex,
      null,
      s.focused,
      s.fileStatuses,
      NOTHING_COLLAPSED,
      NOTHING_IGNORED,
      false,
      new Set(),
      s.treeFilter,
      false,
      new Map(),
      s.unseenFiles,
      s.changedSinceVisit
    )
  }
  return mounted.frame()
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const FULL_TREE = `┌─────────────────────────────────┐
│ Files (0/5)                     │
│○   ▼ docs                       │
│○ R     manual.md                │
│○   ▼ src                        │
│○     ▼ app                      │
│○ M       main.ts                │
│○ D       old.ts                 │
│○     ▼ utils                    │
│○ A       foo.ts                 │
│○ M   README.md                  │
└─────────────────────────────────┘`

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
    expect(await frame({ fileTree: toggleNodeExpansion(TREE, "src/app") })).toBe(`┌─────────────────────────────────┐
│ Files (0/5)                     │
│○   ▼ docs                       │
│○ R     manual.md                │
│○   ▼ src                        │
│○     ▶ app                      │
│○     ▼ utils                    │
│○ A       foo.ts                 │
│○ M   README.md                  │
│                                 │
│                                 │
└─────────────────────────────────┘`)
  })

  test("a filter narrows the rows to the matches and their directories, and heads the panel", async () => {
    expect(await frame({ treeFilter: "foo" })).toBe(`┌─────────────────────────────────┐
│ /foo                            │
│○   ▼ src                        │
│○     ▼ utils                    │
│○ A       foo.ts                 │
│                                 │
│                                 │
│                                 │
│                                 │
│                                 │
│                                 │
└─────────────────────────────────┘`)
  })
})

describe("marks", () => {
  test("viewed files are ticked, stale or not, their directories half-filled, and the header counts them", async () => {
    const fileStatuses = new Map<string, FileReviewStatus>([
      ["src/app/main.ts", { filename: "src/app/main.ts", viewed: true }],
      ["README.md", { filename: "README.md", viewed: true, isStale: true }],
    ])
    expect(await frame({ fileStatuses, focused: false })).toBe(`┌─────────────────────────────────┐
│ Files (2/5)                     │
│○   ▼ docs                       │
│○ R     manual.md                │
│◐   ▼ src                        │
│◐     ▼ app                      │
│✓ M       main.ts                │
│○ D       old.ts                 │
│○     ▼ utils                    │
│○ A       foo.ts                 │
│✓ M   README.md                  │
└─────────────────────────────────┘`)
  })

  test("a dot follows unseen comments up the tree, a caret marks content changed since the last visit", async () => {
    expect(await frame({
      focused: false,
      unseenFiles: new Set(["src/app/main.ts"]),
      changedSinceVisit: new Set(["README.md"]),
    })).toBe(`┌─────────────────────────────────┐
│ Files (0/5)                     │
│○   ▼ docs                       │
│○ R     manual.md                │
│○   ▼ src ●                      │
│○     ▼ app ●                    │
│○ M       main.ts ●              │
│○ D       old.ts                 │
│○     ▼ utils                    │
│○ A       foo.ts                 │
│○ M   README.md ▴                │
└─────────────────────────────────┘`)
  })
})
