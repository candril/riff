import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { buildTablePeek } from "./table-peek"
import type { DiffFile } from "../../utils/diff-parser"

function diffFile(body: string): DiffFile {
  return {
    filename: "docs/table.md",
    additions: 1,
    deletions: 1,
    status: "modified",
    content: [
      "diff --git a/docs/table.md b/docs/table.md",
      "--- a/docs/table.md",
      "+++ b/docs/table.md",
      body,
    ].join("\n"),
  }
}

/**
 *  0 context  | Key | Does |
 *  1 context  |---|---|
 *  2 deletion | gf  | opens the file |
 *  3 addition | gf  | follows the link |
 */
const changed = new DiffLineMapping(
  [
    diffFile(`@@ -1,3 +1,3 @@
 | Key | Does |
 |---|---|
-| gf | opens the file |
+| gf | follows the link |`),
  ],
  "single",
  0,
)

describe("a changed table", () => {
  test("shows the version the change arrives at", () => {
    const peek = buildTablePeek(changed, 0, 60)!

    expect(peek.side).toBe("new")
    expect(peek.lines.join("\n")).toContain("follows the link")
    expect(peek.lines.join("\n")).not.toContain("opens the file")
    expect(peek.hasOther).toBe(true)
  })

  test("and the one it replaces, on the other side", () => {
    const peek = buildTablePeek(changed, 0, 60, "old")!

    expect(peek.side).toBe("old")
    expect(peek.lines.join("\n")).toContain("opens the file")
    expect(peek.lines.join("\n")).not.toContain("follows the link")
    expect(peek.hasOther).toBe(true)
  })

  test("keeps the header on both sides", () => {
    for (const side of ["new", "old"] as const) {
      expect(buildTablePeek(changed, 0, 60, side)!.lines.join("\n")).toContain("Key")
    }
  })
})

describe("a table nothing touched", () => {
  test("has no second version to offer", () => {
    const untouched = new DiffLineMapping(
      [
        diffFile(`@@ -1,4 +1,4 @@
 | Key | Does |
 |---|---|
 | gf | follows the link |
-prose below
+prose below, edited`),
      ],
      "single",
      0,
    )

    const peek = buildTablePeek(untouched, 0, 60)!
    expect(peek.hasOther).toBe(false)
  })
})

describe("a table added whole", () => {
  test("asking for the previous version shows the one that exists", () => {
    const added = new DiffLineMapping(
      [
        diffFile(`@@ -1,1 +1,4 @@
 # Notes
+| Key | Does |
+|---|---|
+| gf | follows the link |`),
      ],
      "single",
      0,
    )

    const peek = buildTablePeek(added, 1, 60, "old")!
    expect(peek.side).toBe("new")
    expect(peek.hasOther).toBe(false)
    expect(peek.lines.join("\n")).toContain("follows the link")
  })
})
