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
    expect(lines.slice(6, 14)).toEqual([
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
    expect(lines.slice(6, 10)).toEqual(["  ▼  Description (0)", "", "    No description provided", ""])
    expect(fgAt(spans, 4, 8)).toEqual(ints(theme.overlay0))
  })

  // The cursor row reads the cells it repaints from inside a paint hook,
  // which OpenTUI refuses: every frame logs the refusal and the row is
  // never painted.
  test("leaves its cursor row unpainted, the paint hook refused", async () => {
    const { panel, mounted } = await mount({ section: "description", info: prInfo(BODY) })
    const consoleError = spyOn(console, "error").mockImplementation(() => {})
    try {
      panel.moveCursor(2)
      const lines = (await mounted.frame()).split("\n")
      const spans = mounted.setup.captureSpans()
      expect(panel.getCursorIndex()).toBe(1)
      expect(lines[9]).toBe("    - one")
      expect(bgAt(spans, 4, 9)).toEqual(ints(theme.base))
      expect(bgAt(spans, 4, 9)).not.toEqual(ints(theme.surface1))
      expect(String(consoleError.mock.calls[0]?.[0])).toContain("Paint hooks record drawing and cannot read the frame")
    } finally {
      consoleError.mockRestore()
    }
  })
})

describe("previews", () => {
  test("say what is live and who posted them while folded", async () => {
    const { lines, spans } = await mount({ section: "files", prepare: (p) => p.setPreviews(previews()) })
    expect(lines[11]).toBe("  ▶  Previews (2)  1 live · 1 on demand  ·  from deploy-bot[bot]")
    expect(fgAt(spans, ...find(lines, "1 live"))).toEqual(ints(theme.subtext0))
  })

  test("list one row per app, links in blue, the selected row on surface0", async () => {
    const { lines, spans } = await mount({
      section: "previews",
      prepare: (p) => {
        p.setPreviews(previews())
        p.moveCursor(1)
      },
    })
    expect(lines.slice(11, 16)).toEqual([
      "  ▼  Previews (2)",
      "",
      "    web         preview  storybook  #812",
      "    admin       on demand",
      "",
    ])
    expect(bgAt(spans, 4, 13)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 115, 13)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, 4, 13)).toEqual(ints(theme.text))
    expect(fgAt(spans, ...find(lines, "preview  storybook"))).toEqual(ints(theme.blue))
    expect(fgAt(spans, ...find(lines, "#812"))).toEqual(ints(theme.overlay0))
    expect(bgAt(spans, 4, 14)).toEqual(ints(theme.base))
    expect(fgAt(spans, 4, 14)).toEqual(ints(theme.subtext1))
    expect(fgAt(spans, ...find(lines, "on demand"))).toEqual(ints(theme.overlay0))
  })
})

describe("checks", () => {
  const expandFailing = (p: PRInfoPanelClass) => {
    for (const id of [3, 4, 5, 6]) p.toggleCheckExpansion(id)
  }
  const OPEN = [
    "  ▼  Checks (6)",
    "",
    "    ✓ build",
    "    ○ lint (in_progress)",
    "    ✗ test (failure)  ▼ [2]",
    "      • src/greet.ts:12:5",
    "          Expected 2, got 3",
    "      • src/farewell.ts",
    "          Unused export",
    "    ✗ e2e (failure)  ▼",
    "      Loading annotations…",
    "    ✗ deploy (timed_out)  ▼",
    "      Could not fetch annotations",
    "    ! audit (action_required)  ▼",
    "      No annotations — press o to open log",
    "",
  ]

  test("list each check with its icon and status, a failing one folded", async () => {
    const { lines, spans } = await mount({ section: "checks" })
    expect(lines.slice(13, 22)).toEqual([
      "  ▼  Checks (6)",
      "",
      "    ✓ build",
      "    ○ lint (in_progress)",
      "    ✗ test (failure)  ▶ [2]",
      "    ✗ e2e (failure)  ▶",
      "    ✗ deploy (timed_out)  ▶",
      "    ! audit (action_required)  ▶",
      "",
    ])
    expect(fgAt(spans, 4, 15)).toEqual(ints(theme.green))
    expect(fgAt(spans, 4, 16)).toEqual(ints(theme.yellow))
    expect(fgAt(spans, 4, 17)).toEqual(ints(theme.red))
    expect(fgAt(spans, 4, 20)).toEqual(ints(theme.peach))
    expect(fgAt(spans, 6, 15)).toEqual(ints(theme.subtext1))
    expect(fgAt(spans, ...find(lines, "(in_progress)"))).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, ...find(lines, "▶ [2]"))).toEqual(ints(theme.overlay0))
  })

  test("open a failing check onto its annotations, or a row saying why there are none", async () => {
    const { lines, spans } = await mount({ section: "checks", prepare: expandFailing })
    expect(lines.slice(13, 29)).toEqual(OPEN)
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
        p.moveCursor(3)
      },
    })
    const [, y] = find(lines, "✗ test")
    expect(bgAt(spans, 4, y)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 115, y)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, 6, y)).toEqual(ints(theme.text))
    expect(fgAt(spans, 6, y - 1)).toEqual(ints(theme.subtext1))
    expect(bgAt(spans, 4, y + 1)).toEqual(ints(theme.base))
  })

  test("mark both lines of a selected annotation on surface0", async () => {
    const { lines, spans } = await mount({
      section: "checks",
      prepare: (p) => {
        expandFailing(p)
        p.moveCursor(4)
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
        p.moveCursor(7)
      },
    })
    const [, y] = find(lines, "Loading annotations…")
    expect(bgAt(spans, 4, y)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 4, y - 1)).toEqual(ints(theme.base))
  })

  test("say there are none when none are configured", async () => {
    const { lines } = await mount({ section: "checks", info: prInfo("Adds the skill.") })
    expect(lines.slice(12, 15)).toEqual(["  ▼  Checks (0)", "", "    No checks configured"])
  })
})
