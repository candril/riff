import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { buildMermaidPeek } from "./mermaid-peek"
import type { DiffFile } from "../../utils/diff-parser"

function diffFile(filename: string, body: string): DiffFile {
  return {
    filename,
    additions: 1,
    deletions: 1,
    status: "modified",
    content: [
      `diff --git a/${filename} b/${filename}`,
      `--- a/${filename}`,
      `+++ b/${filename}`,
      body,
    ].join("\n"),
  }
}

/**
 *  0 context   # Import
 *  1 context   ```mermaid
 *  2 context   graph TD
 *  3 deletion    A[Fetch] --> B[Store]
 *  4 addition    A[Fetch] --> C[Check]
 *  5 addition    C --> B[Store]
 *  6 context   ```
 */
const changed = new DiffLineMapping(
  [
    diffFile(
      "docs/import.md",
      `@@ -1,6 +1,7 @@
 # Import
 \`\`\`mermaid
 graph TD
-  A[Fetch] --> B[Store]
+  A[Fetch] --> C[Check]
+  C --> B[Store]
 \`\`\``,
    ),
  ],
  "single",
  0,
)

describe("the block under the cursor", () => {
  test("draws the version the change arrives at", () => {
    const peek = buildMermaidPeek(changed, 2, "new")!

    expect(peek.kind).toBe("flowchart")
    expect(peek.source).toEqual(["graph TD", "  A[Fetch] --> C[Check]", "  C --> B[Store]"])
    expect(peek.lines.join("\n")).toContain("Check")
    expect(peek.hasOther).toBe(true)
  })

  test("and the one it replaces, on the other side", () => {
    const peek = buildMermaidPeek(changed, 2, "old")!

    expect(peek.source).toEqual(["graph TD", "  A[Fetch] --> B[Store]"])
    expect(peek.lines.join("\n")).not.toContain("Check")
    expect(peek.side).toBe("old")
  })

  test("is found from a deleted row too, and still opens on the new side", () => {
    const peek = buildMermaidPeek(changed, 3, "new")!
    expect(peek.source).toContain("  C --> B[Store]")
  })

  test("is nothing on a fence row, or outside the block", () => {
    expect(buildMermaidPeek(changed, 1, "new")).toBeNull()
    expect(buildMermaidPeek(changed, 6, "new")).toBeNull()
    expect(buildMermaidPeek(changed, 0, "new")).toBeNull()
  })
})

describe("blocks that are not mermaid", () => {
  test("are left to the other peeks", () => {
    const code = new DiffLineMapping(
      [
        diffFile(
          "README.md",
          `@@ -1,4 +1,4 @@
 \`\`\`ts
-const a = 1
+const a = 2
 \`\`\``,
        ),
      ],
      "single",
      0,
    )

    expect(buildMermaidPeek(code, 1, "new")).toBeNull()
  })
})

describe("a block added whole", () => {
  test("has no previous version to switch to", () => {
    const added = new DiffLineMapping(
      [
        diffFile(
          "notes.md",
          `@@ -1,1 +1,5 @@
 # Notes
+\`\`\`mermaid
+graph LR
+  A --> B
+\`\`\``,
        ),
      ],
      "single",
      0,
    )

    const peek = buildMermaidPeek(added, 3, "new")!
    expect(peek.hasOther).toBe(false)
    expect(peek.lines.length).toBeGreaterThan(0)
  })

  test("and asking for it anyway shows the version that exists", () => {
    const added = new DiffLineMapping(
      [
        diffFile(
          "notes.md",
          `@@ -1,1 +1,5 @@
 # Notes
+\`\`\`mermaid
+graph LR
+  A --> B
+\`\`\``,
        ),
      ],
      "single",
      0,
    )

    const peek = buildMermaidPeek(added, 3, "old")!
    expect(peek.side).toBe("new")
    expect(peek.source).toEqual(["graph LR", "  A --> B"])
  })
})

describe("a diagram riff cannot draw", () => {
  test("comes back as its own source, and says why", () => {
    const state = new DiffLineMapping(
      [
        diffFile(
          "notes.md",
          `@@ -1,4 +1,4 @@
 \`\`\`mermaid
 stateDiagram-v2
-  [*] --> Idle
+  [*] --> Ready
 \`\`\``,
        ),
      ],
      "single",
      0,
    )

    const peek = buildMermaidPeek(state, 1, "new")!
    expect(peek.lines).toEqual([])
    expect(peek.note).toBe("riff can't draw a stateDiagram-v2 yet")
    expect(peek.source).toContain("stateDiagram-v2")
  })
})
