import { test, expect, describe } from "bun:test"
import { bgAt, fgAt, ints } from "../testing/frame"
import { prInfo } from "../testing/pr-info"
import { find, fullPr, usePrInfoPanel } from "../testing/pr-info-panel"
import { colors, theme } from "../theme"

// The panel's chrome: meta and stack rows, separator, section headers, filter, flash labels and comment input.

const mount = usePrInfoPanel()

const BOX_DRAWING = /[─-╿]/

const META = "  @someone  a-branch → master   ✓ @alice @erin"
// A glyph rule in surface1, seventy cells whatever the panel's width.
const SEPARATOR = "  " + "─".repeat(70)
// The fixture's threads carry no resolution, which the merge status reads as
// not GitHub's to count and the conversation's summary as open.
const MERGE_STATUS = [
  "  ▼  Merge status  ✗ blocked",
  "",
  "    ✗ Checks         1/6 · test, e2e +2 failing  ▼",
  "      ✓ build",
  "      ○ lint (in_progress)",
  "      ✗ test (failure)  ▶ [2]",
  "      ✗ e2e (failure)  ▶",
  "      ✗ deploy (timed_out)  ▶",
  "      ! audit (action_required)  ▶",
  "    ✗ Reviews        2 approvals · changes requested by bob",
  "    ✓ Conversations  all resolved",
  "    ○ Conflicts      checking",
  "    ○ Base           comparing with master",
  "    ✓ Blockers       none",
]
const FOLDED_MERGE_STATUS =
  "  ▶  Merge status  ✗ blocked · test, e2e failing +2 · ⧗ 1 pending · changes requested"
const HEADERS = [
  "  ▶  Previews (0)",
  "",
  "  ▶  Conversation (7)  2 unresolved",
  "",
  "  ▶  Files (2)  +98 -0",
  "",
  "  ▶  Commits (23)  last 1h",
]

describe("the PR comment input", () => {
  test("stands apart by shade, with the typed text on surface0", async () => {
    const { lines, spans } = await mount({
      info: prInfo("Adds the skill."),
      comments: [],
      prepare: (p) => p.updateCommentInput(true, "hello", false, null),
    })

    const headerRow = lines.findIndex((line) => line.includes("Add PR Comment"))
    const textRow = lines.findIndex((line) => line.includes("hello"))
    const statusRow = lines.findIndex((line) => line.includes("Enter to submit"))
    expect(headerRow).toBeGreaterThanOrEqual(0)
    expect(statusRow).toBeGreaterThan(textRow)

    const left = lines[headerRow]!.indexOf("Add PR Comment") - 2
    const inputBox = lines.slice(headerRow - 1, statusRow + 2).map((line) => line.slice(left, left + 60))
    expect(inputBox.join("\n")).not.toMatch(BOX_DRAWING)

    expect(bgAt(spans, left, headerRow)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, lines[textRow]!.indexOf("hello"), textRow)).toEqual(ints(theme.surface0))
  })
})

describe("the info panel", () => {
  test("marks the selected row with surface0", async () => {
    const { lines, spans } = await mount({
      info: prInfo("Adds the skill."),
      comments: [],
      prepare: (p) => {
        p.setActiveSection("files")
        p.expandSection()
        p.moveCursor(1)
      },
    })

    const y = lines.findIndex((line) => line.includes("src/greet.ts"))
    expect(y).toBeGreaterThanOrEqual(0)
    expect(bgAt(spans, lines[y]!.indexOf("src/greet.ts"), y)).toEqual(ints(theme.surface0))
  })
})

describe("on arrival", () => {
  test("at a review seen for the first time draws the meta row, the separator, the merge status folded, the description open and every other header folded", async () => {
    const { lines } = await mount()
    expect(lines).toEqual([
      "",
      META,
      "",
      "",
      SEPARATOR,
      "",
      FOLDED_MERGE_STATUS,
      "",
      "  ▼  Description (2)",
      "",
      "    Adds the skill.",
      "    Second line with code.",
      "",
      ...HEADERS,
    ])
  })

  test("with the merge status opened draws the meta row, an empty stack row, the separator and six headers, the merge status and the description open", async () => {
    const { lines } = await mount({ mergeStatusOpen: true })
    expect(lines).toEqual([
      "",
      META,
      "",
      "",
      SEPARATOR,
      "",
      ...MERGE_STATUS,
      "",
      "  ▼  Description (2)",
      "",
      "    Adds the skill.",
      "    Second line with code.",
      "",
      ...HEADERS,
    ])
  })

  test("writes the author in blue, the branches in subtext0, and who still approves in green", async () => {
    const { lines, spans } = await mount()
    expect(fgAt(spans, ...find(lines, "@someone"))).toEqual(ints(theme.blue))
    expect(fgAt(spans, ...find(lines, "a-branch → master"))).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, ...find(lines, "✓ @alice @erin"))).toEqual(ints(theme.green))
    expect(lines[1]).not.toContain("@bob")
  })

  test("draws the separator as a glyph rule in surface1", async () => {
    const { spans } = await mount()
    expect(fgAt(spans, 2, 4)).toEqual(ints(theme.surface1))
    expect(fgAt(spans, 71, 4)).toEqual(ints(theme.surface1))
    expect(bgAt(spans, 2, 4)).toEqual(ints(theme.base))
  })

  test("marks the active header blue on surface0, the others overlay0 with their summaries coloured by meaning", async () => {
    const { lines, spans } = await mount({ mergeStatusOpen: true })
    const [, description] = find(lines, "▼  Description")
    expect(fgAt(spans, ...find(lines, "▼  Description"))).toEqual(ints(theme.blue))
    expect(bgAt(spans, ...find(lines, "▼  Description"))).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 110, description)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 2, description + 2)).toEqual(ints(theme.base))

    for (const title of ["Merge status", "Previews", "Conversation (", "Files", "Commits"]) {
      const [x, y] = find(lines, title)
      expect(fgAt(spans, x - 3, y)).toEqual(ints(theme.overlay0))
      expect(fgAt(spans, x, y)).toEqual(ints(theme.overlay0))
      expect(bgAt(spans, x, y)).toEqual(ints(theme.base))
    }
    expect(fgAt(spans, ...find(lines, "✗ blocked"))).toEqual(ints(theme.red))
    expect(fgAt(spans, ...find(lines, "2 unresolved"))).toEqual(ints(theme.yellow))
    expect(fgAt(spans, ...find(lines, "+98"))).toEqual(ints(theme.green))
    expect(fgAt(spans, ...find(lines, "-0"))).toEqual(ints(theme.red))
    expect(fgAt(spans, ...find(lines, "last 1h"))).toEqual(ints(theme.subtext0))
  })

  test("moves the highlight to another header, and drops it from the header when the cursor is in a section", async () => {
    const { lines, spans } = await mount({
      prepare: (p) => {
        p.setActiveSection("files")
        p.expandSection()
        p.moveCursor(1)
      },
    })
    expect(fgAt(spans, ...find(lines, "▼  Files"))).toEqual(ints(theme.blue))
    expect(bgAt(spans, ...find(lines, "▼  Files"))).toEqual(ints(theme.base))
    expect(fgAt(spans, ...find(lines, "▼  Description"))).toEqual(ints(theme.overlay0))
    expect(bgAt(spans, ...find(lines, "▼  Description"))).toEqual(ints(theme.base))
  })

  test("says an empty PR's sections are empty", async () => {
    const { lines } = await mount({ info: prInfo(""), mergeStatusOpen: true })
    expect(lines).toEqual([
      "",
      "  @someone  a-branch → master",
      "",
      "",
      SEPARATOR,
      "",
      "  ▼  Merge status  ⚠ mergeable with warnings",
      "",
      "    ✓ Checks         no checks",
      "    ✓ Reviews        0 approvals",
      "    ✓ Conversations  all resolved",
      "    ○ Conflicts      checking",
      "    ○ Base           comparing with master",
      "    ✓ Blockers       none",
      "",
      "  ▼  Description (0)",
      "",
      "    No description provided",
      "",
      "  ▶  Previews (0)",
      "",
      // The review threads have no review to sit under, so each is one.
      "  ▶  Conversation (3)  2 unresolved",
      "",
      "  ▶  Files (2)  +98 -0",
      "",
      "  ▶  Commits (0)",
    ])
  })

  test("says how many comments another section speaks for", async () => {
    const { lines } = await mount({ prepare: (p) => p.setHiddenConversation(new Set(["502"])) })
    expect(lines[15]).toBe("  ▶  Conversation (6 · 1 hidden)  2 unresolved")
  })
})

describe("the stack row", () => {
  test("names the base in yellow once it has been rewritten", async () => {
    const { lines, spans } = await mount({
      prepare: (p) => p.setStack({ basePr: { number: 1200, title: "Base work" }, status: "rewritten", behindBy: 2 }),
    })
    expect(lines.slice(1, 5)).toEqual([
      META,
      "  stacked on #1200 Base work · base rewritten since you branched — rebase",
      "",
      SEPARATOR,
    ])
    expect(fgAt(spans, 2, 2)).toEqual(ints(theme.yellow))
  })

  test("names a base that moved on in subtext0", async () => {
    const { lines, spans } = await mount({
      prepare: (p) => p.setStack({ basePr: { number: 1200, title: "Base work" }, status: "moved", behindBy: 1 }),
    })
    expect(lines[2]).toBe("  stacked on #1200 Base work · base moved on by 1 commit")
    expect(fgAt(spans, 2, 2)).toEqual(ints(theme.subtext0))
  })
})

describe("fresh PR data", () => {
  test("redraws a changed body and its count", async () => {
    const { lines } = await mount({ prepare: (p) => p.setPrInfo({ ...fullPr(), body: "A new body" }) })
    expect(lines.slice(8, 13)).toEqual(["  ▼  Description (1)", "", "    A new body", "", "  ▶  Previews (0)"])
  })

  test("draws a changed title nowhere: the header line above the panel carries it", async () => {
    const { lines: before, panel, mounted } = await mount()
    panel.setPrInfo({ ...fullPr(), title: "A different title" })
    const after = (await mounted.frame()).split("\n")
    expect(after).toEqual(before)
  })
})

describe("the filter", () => {
  test("takes the top row for its field, and narrows files and conversation to what matches", async () => {
    const { lines, spans } = await mount({
      prepare: (p) => {
        p.setFilter("greet")
        p.syncFilterInput(true, "greet")
      },
    })
    expect(lines).toEqual([
      "  /greet",
      "",
      META,
      "",
      "",
      SEPARATOR,
      "",
      FOLDED_MERGE_STATUS,
      "",
      "  ▼  Description (2)",
      "",
      "    Adds the skill.",
      "    Second line with code.",
      "",
      "  ▶  Previews (0)",
      "",
      // The count is every conversation item; Files counts what matches.
      "  ▼  Conversation (7)",
      "",
      "    ▶ ✗  @bob  requested changes  (3 threads)                                                                       2h",
      "      ▶  greet.ts:12  @bob  Rename greet to welcome, it reads better in the call sit…                        (3)    1h",
      "",
      "  ▼  Files (1)",
      "",
      "    src/greet.ts    +3    -1",
      "",
      "  ▶  Commits (0)",
    ])
    expect(fgAt(spans, 2, 0)).toEqual(ints(colors.secondary))
    expect(fgAt(spans, 3, 0)).toEqual(ints(theme.text))
  })

  test("narrows without its field once the field is closed", async () => {
    const { lines } = await mount({
      prepare: (p) => {
        p.setFilter("greet")
        p.syncFilterInput(true, "greet")
        p.syncFilterInput(false, "greet")
      },
    })
    expect(lines[0]).toBe("")
    expect(lines[1]).toBe(META)
    expect(lines).toContain("  ▼  Files (1)")
  })
})

describe("flash labels", () => {
  test("go in front of a header and a row, in the flash colour", async () => {
    const { lines, spans } = await mount({
      prepare: (p) => {
        p.setActiveSection("files")
        p.expandSection()
        p.setFlashLabels(new Map([["checks", "a"], ["files:1", "sd"]]))
      },
    })
    expect(lines[6]).toBe("  a ▶  Merge status  ✗ blocked · test, e2e failing +2 · ⧗ 1 pending · changes requested")
    expect(lines.slice(17, 21)).toEqual([
      "  ▼  Files (2)",
      "",
      "    src/greet.ts       +3    -1",
      "    sd src/farewell.ts    +5    -0",
    ])
    expect(fgAt(spans, 2, 6)).toEqual(ints(colors.flashLabel))
    expect(fgAt(spans, 4, 6)).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, 4, 20)).toEqual(ints(colors.flashLabel))
    expect(fgAt(spans, 5, 20)).toEqual(ints(colors.flashLabel))
    expect(fgAt(spans, 7, 20)).toEqual(ints(theme.subtext1))
  })
})
