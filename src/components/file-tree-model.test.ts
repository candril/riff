import { describe, expect, test } from "bun:test"
import { colors, theme } from "../theme"
import { parseDiff, sortFiles } from "../utils/diff-parser"
import { buildFileTree, toggleNodeExpansion } from "../utils/file-tree"
import type { FileReviewStatus } from "../types"
import { fileTreeModel, visibleTreeRows, type FileTreeModelInput, type FileTreeRow } from "./file-tree-model"

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

function model(input: Partial<FileTreeModelInput> = {}) {
  return fileTreeModel({
    files: FILES,
    fileTree: TREE,
    highlightIndex: 0,
    selectedFileIndex: null,
    focused: true,
    fileStatuses: new Map(),
    ignoredFiles: new Set(),
    showHiddenFiles: false,
    multiSelectedFilenames: new Set(),
    treeFilter: "",
    treeFilterInput: false,
    flashLabels: new Map(),
    unseenFiles: new Set(),
    changedSinceVisit: new Set(),
    unviewedOnly: null,
    width: 35,
    ...input,
  })
}

const line = (row: FileTreeRow) => `${row.marker.text}${row.status.text}${row.name.text}`
const rowNamed = (rows: FileTreeRow[], key: string) => rows.find((row) => row.key === key)!

describe("rows", () => {
  test("nest directories over their files, each file with its A/M/D/R letter in its colour", () => {
    const { rows, header, hidden } = model()
    expect(rows.map(line)).toEqual([
      "○   ▼ docs",
      "○ R     manual.md",
      "○   ▼ src",
      "○     ▼ app",
      "○ M       main.ts",
      "○ D       old.ts",
      "○     ▼ utils",
      "○ A       foo.ts",
      "○ M   README.md",
    ])
    expect(header).toEqual({ text: "Files (0/5)", fg: colors.primary, filtering: false, note: null, noteFg: colors.secondary })
    expect(hidden).toBeNull()
    expect(rowNamed(rows, "docs/manual.md").status.fg).toBe(colors.fileRenamed)
    expect(rowNamed(rows, "src/app/main.ts").status.fg).toBe(colors.fileModified)
    expect(rowNamed(rows, "src/app/old.ts").status.fg).toBe(colors.fileDeleted)
    expect(rowNamed(rows, "src/utils/foo.ts").status.fg).toBe(colors.fileAdded)
    expect(rowNamed(rows, "src").name.fg).toBe(theme.subtext0)
    expect(rows.map((row) => row.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  test("the cursor row, with the tree focused, is surface0 and the rest have no shade", () => {
    const { rows } = model({ highlightIndex: 4, focused: true })
    expect(rows.map((row) => row.bg)).toEqual([null, null, null, null, theme.surface0, null, null, null, null])
    expect(rows[4]!.name.fg).toBe(colors.fileModified)
  })

  test("unfocused, the file you are in has no shade and is named in the accent colour", () => {
    const selectedFileIndex = FILES.findIndex((file) => file.filename === "README.md")
    const { rows, header } = model({ focused: false, highlightIndex: 0, selectedFileIndex })
    const readme = rowNamed(rows, "README.md")
    expect(readme.bg).toBeNull()
    expect(readme.name.fg).toBe(colors.primary)
    expect(rows.every((row) => row.bg === null)).toBe(true)
    expect(header.fg).toBe(colors.textMuted)
  })

  test("unfocused, the cursor on a file marks it as the one you are in", () => {
    const { rows } = model({ focused: false, highlightIndex: 4 })
    expect(rows[4]!.bg).toBeNull()
    expect(rows[4]!.name.fg).toBe(colors.primary)
  })

  test("a V-range is surface0 on each of its rows", () => {
    const { rows } = model({
      highlightIndex: 0,
      multiSelectedFilenames: new Set(["src/app/main.ts", "src/app/old.ts"]),
    })
    expect(rowNamed(rows, "src/app/main.ts").bg).toBe(theme.surface0)
    expect(rowNamed(rows, "src/app/old.ts").bg).toBe(theme.surface0)
    expect(rowNamed(rows, "src/utils/foo.ts").bg).toBeNull()
  })
})

describe("viewed", () => {
  test("ticks viewed files, stale or not, half-fills partly viewed directories, and counts them in the header", () => {
    const fileStatuses = new Map<string, FileReviewStatus>([
      ["src/app/main.ts", { filename: "src/app/main.ts", viewed: true }],
      ["README.md", { filename: "README.md", viewed: true, isStale: true }],
    ])
    const { rows, header } = model({ fileStatuses, focused: false })
    expect(header.text).toBe("Files (2/5)")
    expect(rowNamed(rows, "src/app/main.ts").marker).toEqual({ text: "✓ ", fg: colors.viewedOk })
    expect(rowNamed(rows, "src/app/main.ts").name.fg).toBe(colors.fileViewed)
    expect(rowNamed(rows, "src/app/main.ts").status.fg).toBe(colors.fileViewed)
    expect(rowNamed(rows, "README.md").marker).toEqual({ text: "✓ ", fg: colors.viewedStale })
    expect(rowNamed(rows, "src/app").marker).toEqual({ text: "◐ ", fg: colors.viewedNone })
    expect(rowNamed(rows, "docs").marker).toEqual({ text: "○ ", fg: colors.viewedNone })
  })

  test("a directory whose files are all viewed is ticked, and stale when any of them is", () => {
    const fileStatuses = new Map<string, FileReviewStatus>([
      ["src/app/main.ts", { filename: "src/app/main.ts", viewed: true }],
      ["src/app/old.ts", { filename: "src/app/old.ts", viewed: true, isStale: true }],
      ["src/utils/foo.ts", { filename: "src/utils/foo.ts", viewed: true }],
    ])
    const { rows } = model({ fileStatuses })
    expect(rowNamed(rows, "src/app").marker).toEqual({ text: "✓ ", fg: colors.viewedStale })
    expect(rowNamed(rows, "src/utils").marker).toEqual({ text: "✓ ", fg: colors.viewedOk })
    expect(rowNamed(rows, "src/utils").name.fg).toBe(colors.fileViewed)
  })

  test("the header's count leaves ignored files out of both sides", () => {
    const fileStatuses = new Map<string, FileReviewStatus>([
      ["README.md", { filename: "README.md", viewed: true }],
      ["src/app/main.ts", { filename: "src/app/main.ts", viewed: true }],
    ])
    expect(model({ fileStatuses, ignoredFiles: new Set(["README.md"]) }).header.text).toBe("Files (1/4)")
  })
})

describe("filter", () => {
  test("narrows the rows and heads the panel as /text in the secondary colour", () => {
    const { rows, header } = model({ treeFilter: "foo" })
    expect(header).toEqual({ text: "/foo", fg: colors.secondary, filtering: false, note: null, noteFg: colors.secondary })
    expect(rows.map(line)).toEqual(["○   ▼ src", "○     ▼ utils", "○ A       foo.ts"])
  })

  test("the open prompt says the header row is filtering", () => {
    expect(model({ treeFilterInput: true }).header.filtering).toBe(true)
  })
})

describe("ignored files", () => {
  const ignoredFiles = new Set(["src/utils/foo.ts", "README.md"])

  test("are hidden, the directories they leave empty dropped, and counted below", () => {
    const { rows, hidden, items } = model({ ignoredFiles })
    expect(rows.map((row) => row.key)).toEqual(["docs", "docs/manual.md", "src", "src/app", "src/app/main.ts", "src/app/old.ts"])
    expect(rows.map((row) => row.index)).toEqual([0, 1, 2, 3, 4, 5])
    expect(items.map((item) => item.node.path)).toEqual(rows.map((row) => row.key))
    expect(hidden).toBe("(+2 hidden)")
  })

  test("are shown when hidden files are", () => {
    const { rows, hidden } = model({ ignoredFiles, showHiddenFiles: true })
    expect(rows).toHaveLength(9)
    expect(hidden).toBeNull()
  })
})

describe("since your last visit", () => {
  test("a dot follows unseen comments up the tree, a caret follows moved content", () => {
    const { rows } = model({
      focused: false,
      highlightIndex: 0,
      unseenFiles: new Set(["src/app/main.ts"]),
      changedSinceVisit: new Set(["src/app/old.ts"]),
    })
    expect(rowNamed(rows, "src").name.text).toBe("▼ src ● ▴")
    expect(rowNamed(rows, "src/app").name.text).toBe("  ▼ app ● ▴")
    expect(rowNamed(rows, "src/app/main.ts").name).toMatchObject({ text: "      main.ts ●", fg: colors.commentLocal })
    expect(rowNamed(rows, "src/app/old.ts").name).toMatchObject({ text: "      old.ts ▴", fg: colors.fileDeleted })
    expect(rowNamed(rows, "src").name.fg).toBe(theme.subtext0)
    expect(rowNamed(rows, "docs").name.text).toBe("▼ docs")
  })
})

test("a flash label takes the marker's cell", () => {
  const { rows } = model({ flashLabels: new Map([["4", "a"]]) })
  expect(rows[4]!.marker).toEqual({ text: "a ", fg: colors.flashLabel })
  expect(rows[3]!.marker.text).toBe("○ ")
})

test("a name too long for the width is cut with an ellipsis", () => {
  const { rows } = model({ width: 16 })
  // 16 wide, less the padding, leaves README.md 8 cells; main.ts, two levels down, falls to the floor of 5.
  expect(rowNamed(rows, "README.md").name.text).toBe("  README.…")
  expect(rowNamed(rows, "src/app/main.ts").name.text).toBe("      main…")
  expect(model({ width: 35 }).rows.find((row) => row.key === "README.md")!.name.text).toBe("  README.md")
})

test("a cut name makes room for its marks instead of losing them off the edge", () => {
  const { rows } = model({ width: 16, unseenFiles: new Set(["README.md"]), changedSinceVisit: new Set(["README.md"]) })
  expect(rowNamed(rows, "README.md").name.text).toBe("  READ… ● ▴")
})

test("rows keep their keys when a sibling directory folds", () => {
  const open = model().rows
  const folded = model({ fileTree: toggleNodeExpansion(TREE, "src/app") }).rows
  expect(folded.map((row) => row.key)).toEqual(["docs", "docs/manual.md", "src", "src/app", "src/utils", "src/utils/foo.ts", "README.md"])
  expect(rowNamed(folded, "src/app").name.text).toBe("  ▶ app")
  for (const row of folded) expect(open.some((o) => o.key === row.key)).toBe(true)
  expect(rowNamed(folded, "src/utils").index).toBe(4)
})

describe("unviewed only", () => {
  const viewed = (...names: string[]): Map<string, FileReviewStatus> =>
    new Map(names.map((filename) => [filename, { filename, viewed: true, viewedAt: "2026-10-21T00:00:00Z" }]))

  test("hides viewed files and the directories they leave empty, and the header says how many", () => {
    const { rows, header } = model({
      fileStatuses: viewed("docs/manual.md", "src/app/main.ts", "src/utils/foo.ts"),
      unviewedOnly: { keep: null },
    })
    expect(rows.map(line)).toEqual(["◐   ▼ src", "◐     ▼ app", "○ D       old.ts", "○ M   README.md"])
    expect(rows.map((row) => row.index)).toEqual([0, 1, 2, 3])
    expect(header.text).toBe("Files (3/5)")
    expect(header.note).toBe("unviewed only · 3 hidden")
  })

  test("a directory of viewed and ignored files disappears too, while ignored files behave as before", () => {
    const { rows, hidden } = model({
      fileStatuses: viewed("src/app/main.ts"),
      ignoredFiles: new Set(["src/app/old.ts"]),
      unviewedOnly: { keep: null },
    })
    expect(rows.map((row) => row.key)).toEqual(["docs", "docs/manual.md", "src", "src/utils", "src/utils/foo.ts", "README.md"])
    expect(hidden).toBe("(+1 hidden)")
  })

  test("the kept file stays and does not count as hidden", () => {
    const { rows, header } = model({
      fileStatuses: viewed("src/app/main.ts", "src/utils/foo.ts"),
      unviewedOnly: { keep: "src/app/main.ts" },
    })
    expect(rows.map((row) => row.key)).toContain("src/app/main.ts")
    expect(rows.map((row) => row.key)).not.toContain("src/utils/foo.ts")
    expect(header.note).toBe("unviewed only · 1 hidden")
  })

  test("the count leaves out files the path filter or the ignore rule already dropped", () => {
    const fileStatuses = viewed("docs/manual.md", "src/app/main.ts", "src/utils/foo.ts")
    expect(model({ fileStatuses, ignoredFiles: new Set(["docs/manual.md"]), unviewedOnly: { keep: null } }).header.note)
      .toBe("unviewed only · 2 hidden")
    const filtered = visibleTreeRows(TREE, FILES, new Set(), false, "src/app", { statuses: fileStatuses, keep: null })
    expect(filtered.hiddenViewed).toBe(1)
    expect(filtered.items.map((item) => item.node.path)).toEqual(["src", "src/app", "src/app/old.ts"])
  })

  test("counts viewed files inside a folded directory", () => {
    const folded = toggleNodeExpansion(TREE, "src")
    const { rows, header } = model({ fileTree: folded, fileStatuses: viewed("src/app/main.ts"), unviewedOnly: { keep: null } })
    expect(rows.map((row) => row.key)).toEqual(["docs", "docs/manual.md", "src", "README.md"])
    expect(header.note).toBe("unviewed only · 1 hidden")
  })

  test("with nothing hidden the note still says the toggle is on; the prompt and a filter hide it", () => {
    expect(model({ unviewedOnly: { keep: null } }).header.note).toBe("unviewed only · 0 hidden")
    expect(model({ unviewedOnly: { keep: null }, treeFilterInput: true }).header.note).toBeNull()
    expect(model({ unviewedOnly: { keep: null }, treeFilter: "foo" }).header.note).toBeNull()
    expect(model().header.note).toBeNull()
  })

  test("every file viewed leaves the empty-state line in place of rows", () => {
    const all = viewed(...FILES.map((file) => file.filename))
    const { rows, empty, header } = model({ fileStatuses: all, unviewedOnly: { keep: null } })
    expect(rows).toEqual([])
    expect(empty).toBe("All files viewed · H shows them")
    expect(header.note).toBe("unviewed only · 5 hidden")
    expect(model({ fileStatuses: all }).empty).toBeNull()
  })
})

describe("the / filter's highlighted matches (spec 007)", () => {
  const m = (text: string) => ({ text, matched: true })
  const u = (text: string) => ({ text, matched: false })
  const spansOf = (treeFilter: string, key: string, width = 35) => rowNamed(model({ treeFilter, width }).rows, key).name.spans

  test("a file's row picks out the matched characters of its own name", () => {
    expect(spansOf("man", "docs/manual.md")).toEqual([u("    "), m("man"), u("ual.md")])
    expect(spansOf("man", "src/app/main.ts")).toEqual([u("      "), m("ma"), u("i"), m("n"), u(".ts")])
  })

  test("the share of a match that fell on the directories above is not drawn, not even on the indent", () => {
    expect(spansOf("appmain", "src/app/main.ts")).toEqual([u("      "), m("main"), u(".ts")])
  })

  test("a path match that hit the directories shows the name's own match, when the name matches by itself", () => {
    // On the path, at is the a of app and the t of .ts; main.ts alone has its own a and t.
    expect(spansOf("at", "src/app/main.ts")).toEqual([u("      m"), m("a"), u("in."), m("t"), u("s")])
  })

  test("a path match that hit the directories, with a name that does not match by itself, shows only its share on the name", () => {
    expect(spansOf("sm", "src/app/main.ts")).toEqual([u("      "), m("m"), u("ain.ts")])
  })

  test("a directory's row picks out its own name, and one kept only for what is under it shows nothing", () => {
    expect(spansOf("src", "src")).toEqual([u("▼ "), m("src")])
    expect(spansOf("src", "src/app")).toEqual([u("  ▼ app")])
    expect(spansOf("appmain", "src/app")).toEqual([u("  ▼ app")])
    expect(spansOf("src", "src/app/main.ts")).toEqual([u("      main.ts")])
  })

  test("a name cut with … shows no match past the cut", () => {
    expect(spansOf("main", "src/app/main.ts", 12)).toEqual([u("      "), m("main"), u("…")])
    expect(spansOf("ts", "src/app/main.ts", 12)).toEqual([u("      main…")])
  })

  test("no filter draws every name plain", () => {
    for (const row of model().rows) expect(row.name.spans).toEqual([u(row.name.text)])
  })
})
