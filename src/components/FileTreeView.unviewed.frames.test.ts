import { test, expect, describe, afterEach } from "bun:test"
import { mountRenderable } from "../testing/frame"
import { createFileTreeIsland, type FileTreeIsland } from "../app/file-tree"
import { parseDiff, sortFiles } from "../utils/diff-parser"
import { buildFileTree } from "../utils/file-tree"
import type { FileReviewStatus } from "../types"

/*
 * The tree with `H` on: viewed files gone, the directories they emptied gone
 * with them, and the header saying how many went. The note is the first
 * thing a narrow panel gives up.
 */

const diffOf = (name: string) => `diff --git a/${name} b/${name}
--- a/${name}
+++ b/${name}
@@ -1,1 +1,1 @@
-a
+b
`
const FILES = sortFiles(
  parseDiff(["src/app/main.ts", "src/app/old.ts", "src/utils/foo.ts", "docs/manual.md", "README.md"].map(diffOf).join(""))
)
const TREE = buildFileTree(FILES)

const viewed = (...names: string[]) =>
  new Map<string, FileReviewStatus>(names.map((filename) => [filename, { filename, viewed: true }]))

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

async function frame(options: { width?: number; statuses: Map<string, FileReviewStatus>; keep?: string | null }) {
  const width = options.width ?? 35
  await mounted?.dispose()
  let tree!: FileTreeIsland
  mounted = await mountRenderable((renderer) => {
    tree = createFileTreeIsland(renderer, { width })
    return tree.host
  }, { width, height: 8 })
  tree.update({
    files: FILES,
    fileTree: TREE,
    highlightIndex: 0,
    selectedFileIndex: null,
    focused: true,
    fileStatuses: options.statuses,
    unviewedOnly: { keep: options.keep ?? null },
  })
  return mounted.frame()
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

describe("unviewed only", () => {
  test("hides viewed files and the directories they empty, and the header counts them", async () => {
    expect(await frame({ width: 45, statuses: viewed("docs/manual.md", "src/app/main.ts", "src/utils/foo.ts") })).toBe(
      `  Files (3/5)  unviewed only · 3 hidden
 ◐   ▼ src
 ◐     ▼ app
 ○ M       old.ts
 ○ M   README.md`
    )
  })

  test("keeps the file you are on, which does not count as hidden", async () => {
    expect(
      await frame({ width: 45, statuses: viewed("docs/manual.md", "src/app/main.ts"), keep: "src/app/main.ts" })
    ).toBe(
      `  Files (2/5)  unviewed only · 1 hidden
 ◐   ▼ src
 ◐     ▼ app
 ✓ M       main.ts
 ○ M       old.ts
 ○     ▼ utils
 ○ M       foo.ts
 ○ M   README.md`
    )
  })

  test("a narrow panel cuts the note before the label", async () => {
    const text = await frame({ width: 24, statuses: viewed("docs/manual.md", "src/app/main.ts", "src/utils/foo.ts") })
    expect(text.split("\n")[0]).toBe("  Files (3/5)  unviewed")
    const narrowest = await frame({ width: 16, statuses: viewed("docs/manual.md", "src/app/main.ts", "src/utils/foo.ts") })
    expect(narrowest.split("\n")[0]).toBe("  Files (3/5)")
  })

  test("the default panel still shows the label whole", async () => {
    const text = await frame({ statuses: viewed("docs/manual.md", "src/app/main.ts", "src/utils/foo.ts") })
    expect(text.split("\n")[0]).toBe("  Files (3/5)  unviewed only · 3 h")
  })

  test("every file viewed leaves the empty state in place of rows", async () => {
    expect(await frame({ statuses: viewed(...FILES.map((file) => file.filename)) })).toBe(
      `  Files (5/5)  unviewed only · 5 h
  All files viewed · H shows them`
    )
  })
})
