import { test, expect, describe, spyOn } from "bun:test"
import type { PRInfoPanelClass } from "./PRInfoPanel"
import { attributesAt, bgAt, fgAt, ints } from "../testing/frame"
import { previews, prInfo } from "../testing/pr-info"
import { find, MARKDOWN_WHITE, usePrInfoPanel } from "../testing/pr-info-panel"
import { theme } from "../theme"

// The description, previews and checks sections opened; section rows start at column 4.

const mount = usePrInfoPanel()

describe("the description", () => {
  // No heading or block quote: those settle a moment after the first
  // frame, once highlighting has run, and would make the frame racy.
  const BODY = "Adds the **skill**.\n\n- one\n- `two`"

  test("renders its markdown", async () => {
    const { lines, spans } = await mount({ section: "description", info: prInfo(BODY) })
    expect(lines.slice(8, 16)).toEqual([
      "  ▼  Description (3)",
      "",
      "    Adds the skill.",
      "    - one",
      "    - two",
      "",
      "  ▶  Previews (0)",
      "",
    ])
    // The prose takes the markdown's default white, not theme.text.
    expect(fgAt(spans, ...find(lines, "Adds"))).toEqual(ints(MARKDOWN_WHITE))
    expect(attributesAt(spans, ...find(lines, "skill"))).toBe(1)
    expect(fgAt(spans, ...find(lines, "- one"))).toEqual(ints(theme.yellow))
    expect(fgAt(spans, ...find(lines, "two"))).toEqual(ints(theme.green))
  })

  test("says there is none when the body is empty", async () => {
    const { lines, spans } = await mount({ section: "description", info: prInfo("  ") })
    expect(lines.slice(8, 12)).toEqual(["  ▼  Description (0)", "", "    No description provided", ""])
    expect(fgAt(spans, 4, 10)).toEqual(ints(theme.overlay0))
  })

  /** The description after `act`, as drawn, and how often console.error was called while drawing it. */
  const withCursor = async (act: (panel: PRInfoPanelClass) => void) => {
    const { panel, mounted } = await mount({ section: "description", info: prInfo(BODY) })
    const consoleError = spyOn(console, "error").mockImplementation(() => {})
    try {
      act(panel)
      const lines = (await mounted.frame()).split("\n")
      return { panel, lines, spans: mounted.setup.captureSpans(), errors: consoleError.mock.calls.length }
    } finally {
      consoleError.mockRestore()
    }
  }

  test("paints its cursor row on surface1, keeping the text's colours", async () => {
    const { panel, lines, spans, errors } = await withCursor((p) => p.moveCursor(2))
    expect(panel.getCursorIndex()).toBe(1)
    expect(lines[11]).toBe("    - one")
    for (const x of [4, 6, 60, 115]) expect(bgAt(spans, x, 11)).toEqual(ints(theme.surface1))
    expect(fgAt(spans, ...find(lines, "- one"))).toEqual(ints(theme.yellow))
    expect(bgAt(spans, 4, 10)).toEqual(ints(theme.base))
    expect(bgAt(spans, 4, 12)).toEqual(ints(theme.base))
    expect(errors).toBe(0)
  })

  test("clears its cursor row once the cursor moves onto the header", async () => {
    const { lines, spans, errors } = await withCursor((p) => {
      p.moveCursor(2)
      p.moveCursor(-2)
    })
    expect(lines[11]).toBe("    - one")
    expect(bgAt(spans, 4, 11)).toEqual(ints(theme.base))
    expect(errors).toBe(0)
  })

  test("clears its cursor row once the cursor leaves for the next section", async () => {
    const { panel, lines, spans } = await withCursor((p) => {
      p.moveCursor(2)
      p.cycleSection(1)
    })
    expect(panel.getActiveSection()).toBe("previews")
    expect(lines[11]).toBe("    - one")
    expect(bgAt(spans, 4, 11)).toEqual(ints(theme.base))
  })

  // A refreshed panel is handed a row before its description has been laid
  // out, so the row may lie past the lines it turns out to have.
  test("paints its last line for a restored cursor past the end", async () => {
    const { panel, mounted } = await mount({
      section: "description",
      info: prInfo(BODY),
      prepare: (p) => p.restorePosition({ ...p.capturePosition(), cursorIndex: 40 }),
    })
    const lines = (await mounted.frame()).split("\n")
    const spans = mounted.setup.captureSpans()
    expect(panel.getCursorIndex()).toBe(40)
    expect(lines[12]).toBe("    - two")
    expect(bgAt(spans, 4, 12)).toEqual(ints(theme.surface1))
    expect(fgAt(spans, ...find(lines, "two"))).toEqual(ints(theme.green))
    expect(bgAt(spans, 4, 11)).toEqual(ints(theme.base))
  })
})

describe("previews", () => {
  test("say what is live and who posted them while folded", async () => {
    const { lines, spans } = await mount({ section: "files", prepare: (p) => p.setPreviews(previews()) })
    expect(lines[13]).toBe("  ▶  Previews (2)  1 live · 1 on demand  ·  from deploy-bot[bot]")
    expect(fgAt(spans, ...find(lines, "1 live"))).toEqual(ints(theme.green))
  })

  test("list one row per app, links in blue, the selected row on surface0", async () => {
    const { lines, spans } = await mount({
      section: "previews",
      prepare: (p) => {
        p.setPreviews(previews())
        p.moveCursor(1)
      },
    })
    expect(lines.slice(13, 18)).toEqual([
      "  ▼  Previews (2)",
      "",
      "    web         preview  storybook  #812",
      "    admin       on demand",
      "",
    ])
    expect(bgAt(spans, 4, 15)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 115, 15)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, 4, 15)).toEqual(ints(theme.text))
    expect(fgAt(spans, ...find(lines, "preview  storybook"))).toEqual(ints(theme.blue))
    expect(fgAt(spans, ...find(lines, "#812"))).toEqual(ints(theme.overlay0))
    expect(bgAt(spans, 4, 16)).toEqual(ints(theme.base))
    expect(fgAt(spans, 4, 16)).toEqual(ints(theme.subtext1))
    expect(fgAt(spans, ...find(lines, "on demand"))).toEqual(ints(theme.overlay0))
  })

  // The row just left goes back to the unselected colours, not only the
  // background: the app name is restyled with it.
  test("restyle the row the cursor leaves and the one it lands on", async () => {
    const { panel, mounted } = await mount({
      section: "previews",
      prepare: (p) => {
        p.setPreviews(previews())
        p.moveCursor(1)
      },
    })
    panel.moveCursor(1)
    const lines = (await mounted.frame()).split("\n")
    const spans = mounted.setup.captureSpans()
    expect(lines.slice(15, 17)).toEqual(["    web         preview  storybook  #812", "    admin       on demand"])
    expect(bgAt(spans, 4, 15)).toEqual(ints(theme.base))
    expect(fgAt(spans, 4, 15)).toEqual(ints(theme.subtext1))
    expect(bgAt(spans, 4, 16)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, 4, 16)).toEqual(ints(theme.text))
  })
})

describe("checks", () => {
  const expandFailing = (p: PRInfoPanelClass) => {
    for (const id of [3, 4, 5, 6]) p.toggleCheckExpansion(id)
  }
  // The checks sit under the merge status's checks line, the gates after them.
  const HEADER = "  ▼  Merge status  ✗ blocked"
  const CHECKS_LINE = "    ✗ Checks         1/6 · test, e2e +2 failing  ▼"
  const OTHER_GATES = [
    "    ✗ Reviews        2 approvals · changes requested by bob",
    "    ✓ Conversations  all resolved",
    "    ○ Conflicts      checking",
    "    ○ Base           comparing with master",
    "    ✓ Blockers       none",
  ]
  const OPEN = [
    HEADER,
    "",
    CHECKS_LINE,
    "      ✓ build",
    "      ○ lint (in_progress)",
    "      ✗ test (failure)  ▼ [2]",
    "        • src/greet.ts:12:5",
    "            Expected 2, got 3",
    "        • src/farewell.ts",
    "            Unused export",
    "      ✗ e2e (failure)  ▼",
    "        Loading annotations…",
    "      ✗ deploy (timed_out)  ▼",
    "        Could not fetch annotations",
    "      ! audit (action_required)  ▼",
    "        No annotations — press o to open log",
    ...OTHER_GATES,
    "",
  ]

  test("list each check with its icon and status, a failing one folded", async () => {
    const { lines, spans } = await mount({ section: "checks" })
    expect(lines.slice(6, 21)).toEqual([
      HEADER,
      "",
      CHECKS_LINE,
      "      ✓ build",
      "      ○ lint (in_progress)",
      "      ✗ test (failure)  ▶ [2]",
      "      ✗ e2e (failure)  ▶",
      "      ✗ deploy (timed_out)  ▶",
      "      ! audit (action_required)  ▶",
      ...OTHER_GATES,
      "",
    ])
    expect(fgAt(spans, 6, 9)).toEqual(ints(theme.green))
    expect(fgAt(spans, 6, 10)).toEqual(ints(theme.yellow))
    expect(fgAt(spans, 6, 11)).toEqual(ints(theme.red))
    expect(fgAt(spans, 6, 14)).toEqual(ints(theme.peach))
    expect(fgAt(spans, 8, 9)).toEqual(ints(theme.subtext1))
    expect(fgAt(spans, ...find(lines, "(in_progress)"))).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, ...find(lines, "▶ [2]"))).toEqual(ints(theme.overlay0))
  })

  test("open a failing check onto its annotations, or a row saying why there are none", async () => {
    const { lines, spans } = await mount({ section: "checks", prepare: expandFailing })
    expect(lines.slice(6, 6 + OPEN.length)).toEqual(OPEN)
    expect(fgAt(spans, ...find(lines, "• src/greet.ts"))).toEqual(ints(theme.red))
    expect(fgAt(spans, ...find(lines, "• src/farewell.ts"))).toEqual(ints(theme.yellow))
    expect(fgAt(spans, ...find(lines, "src/greet.ts:12:5"))).toEqual(ints(theme.subtext1))
    expect(fgAt(spans, ...find(lines, "Expected 2"))).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, ...find(lines, "Loading annotations…"))).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, ...find(lines, "Could not fetch"))).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, ...find(lines, "No annotations"))).toEqual(ints(theme.overlay0))
  })

  test("mark the selected check on surface0, its name in text", async () => {
    const { lines, spans } = await mount({
      section: "checks",
      prepare: (p) => {
        expandFailing(p)
        p.moveCursor(4)
      },
    })
    const [, y] = find(lines, "✗ test")
    expect(bgAt(spans, 4, y)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 115, y)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, 8, y)).toEqual(ints(theme.text))
    expect(fgAt(spans, 8, y - 1)).toEqual(ints(theme.subtext1))
    expect(bgAt(spans, 4, y + 1)).toEqual(ints(theme.base))
  })

  test("mark both lines of a selected annotation on surface0", async () => {
    const { lines, spans } = await mount({
      section: "checks",
      prepare: (p) => {
        expandFailing(p)
        p.moveCursor(5)
      },
    })
    const [x, y] = find(lines, "src/greet.ts:12:5")
    expect(bgAt(spans, x, y)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 4, y + 1)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 115, y + 1)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, x, y)).toEqual(ints(theme.text))
    expect(bgAt(spans, 4, y + 2)).toEqual(ints(theme.base))
    expect(bgAt(spans, 4, y - 1)).toEqual(ints(theme.base))
  })

  test("mark a selected placeholder row on surface0", async () => {
    const { lines, spans } = await mount({
      section: "checks",
      prepare: (p) => {
        expandFailing(p)
        p.moveCursor(8)
      },
    })
    const [, y] = find(lines, "Loading annotations…")
    expect(bgAt(spans, 4, y)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 4, y - 1)).toEqual(ints(theme.base))
  })

  test("say there are none when none are configured, on a checks line that does not open", async () => {
    const { lines } = await mount({ section: "checks", info: prInfo("Adds the skill.") })
    expect(lines.slice(7, 10)).toEqual(["", "    ✓ Checks         no checks", "    ✓ Reviews        0 approvals"])
  })
})
