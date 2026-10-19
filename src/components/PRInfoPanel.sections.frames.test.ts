import { test, expect, describe, afterEach, afterAll, beforeEach, setSystemTime, spyOn } from "bun:test"
import { PRInfoPanelClass } from "./PRInfoPanel"
import * as github from "../providers/github"
import { attributesAt, bgAt, fgAt, ints, mountRenderable, pinStdoutColumns } from "../testing/frame"
import {
  checks,
  commits,
  conversationComments,
  previews,
  prInfo,
  PR_NOW,
  reviews,
  reviewThreadComments,
} from "../testing/pr-info"
import { theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"
import type { PrInfo } from "../providers/github"
import type { PRInfoPanelSection } from "../state"

/*
 * Each section of the panel opened, on a 120-wide screen: the description,
 * previews, checks, conversation, files and commits. Section rows start at
 * column 4. The panel's chrome is in PRInfoPanel.frames.test.ts.
 *
 * The clock is frozen, since the times read `new Date()`, and
 * process.stdout.columns is pinned to the screen's width, since the panel
 * cuts its rows to the terminal's width rather than its own; one test
 * pins it narrower than the screen to show that.
 */

// Expanding a failing check whose annotations are not settled asks gh for
// them. Every fixture check has them settled, and this fails any that slips.
const fetchAnnotations = spyOn(github, "getPrCheckAnnotations").mockImplementation(() => {
  throw new Error("a frame test asked gh for check annotations")
})
afterAll(() => fetchAnnotations.mockRestore())

const FILES: DiffFile[] = [
  { filename: "src/greet.ts", additions: 3, deletions: 1, status: "modified", content: "" },
  { filename: "src/farewell.ts", additions: 5, deletions: 0, status: "added", content: "" },
]

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null
let panel: PRInfoPanelClass | null = null
let restoreColumns: (() => void) | null = null

beforeEach(() => {
  setSystemTime(PR_NOW)
  restoreColumns = pinStdoutColumns(120)
})

afterEach(async () => {
  panel?.destroy()
  panel = null
  await mounted?.dispose()
  mounted = null
  restoreColumns?.()
  setSystemTime()
  expect(fetchAnnotations).not.toHaveBeenCalled()
})

const fullPr = (): PrInfo =>
  prInfo("Adds the **skill**.\n\nSecond line with `code`.", {
    reviews: reviews(),
    conversationComments: conversationComments(),
    checks: checks(),
    commits: commits(23),
  })

interface Show {
  info?: PrInfo
  files?: DiffFile[]
  height?: number
}

/** The fixture PR with `section` open and active, after `prepare`, as drawn. */
async function show(
  section: PRInfoPanelSection,
  prepare: (panel: PRInfoPanelClass) => void = () => {},
  { info = fullPr(), files = FILES, height = 40 }: Show = {}
) {
  mounted = await mountRenderable(
    (renderer) => {
      panel = new PRInfoPanelClass(renderer, info, files, reviewThreadComments())
      return panel.getContainer()
    },
    { width: 120, height }
  )
  panel!.setActiveSection(section)
  panel!.expandSection()
  prepare(panel!)
  const lines = (await mounted.frame()).split("\n")
  return { lines, spans: mounted.setup.captureSpans() }
}

const MARKDOWN_WHITE = "#ffffff"

/** Where `needle` first shows, as [column, row]. */
function find(lines: string[], needle: string, from = 0): [number, number] {
  for (let y = from; y < lines.length; y++) {
    const x = lines[y]!.indexOf(needle)
    if (x >= 0) return [x, y]
  }
  throw new Error(`"${needle}" is not on screen`)
}

describe("the description", () => {
  // No heading or block quote: those settle a moment after the first
  // frame, once highlighting has run, and would make the frame racy.
  const BODY = "Adds the **skill**.\n\n- one\n- `two`"

  test("renders its markdown", async () => {
    const { lines, spans } = await show("description", () => {}, { info: prInfo(BODY) })
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
    const { lines, spans } = await show("description", () => {}, { info: prInfo("  ") })
    expect(lines.slice(6, 10)).toEqual(["  ▼  Description (0)", "", "    No description provided", ""])
    expect(fgAt(spans, 4, 8)).toEqual(ints(theme.overlay0))
  })

  // The cursor row reads the cells it repaints from inside a paint hook,
  // which OpenTUI refuses: every frame logs the refusal and the row is
  // never painted.
  test("leaves its cursor row unpainted, the paint hook refused", async () => {
    await show("description", () => {}, { info: prInfo(BODY) })
    const consoleError = spyOn(console, "error").mockImplementation(() => {})
    try {
      panel!.moveCursor(2)
      const lines = (await mounted!.frame()).split("\n")
      const spans = mounted!.setup.captureSpans()
      expect(panel!.getCursorIndex()).toBe(1)
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
    const { lines, spans } = await show("files", (p) => p.setPreviews(previews()))
    expect(lines[11]).toBe("  ▶  Previews (2)  1 live · 1 on demand  ·  from deploy-bot[bot]")
    expect(fgAt(spans, ...find(lines, "1 live"))).toEqual(ints(theme.subtext0))
  })

  test("list one row per app, links in blue, the selected row on surface0", async () => {
    const { lines, spans } = await show("previews", (p) => {
      p.setPreviews(previews())
      p.moveCursor(1)
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
    const { lines, spans } = await show("checks")
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
    const { lines, spans } = await show("checks", expandFailing)
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
    const { lines, spans } = await show("checks", (p) => {
      expandFailing(p)
      p.moveCursor(3)
    })
    const [, y] = find(lines, "✗ test")
    expect(bgAt(spans, 4, y)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 115, y)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, 6, y)).toEqual(ints(theme.text))
    expect(fgAt(spans, 6, y - 1)).toEqual(ints(theme.subtext1))
    expect(bgAt(spans, 4, y + 1)).toEqual(ints(theme.base))
  })

  test("mark both lines of a selected annotation on surface0", async () => {
    const { lines, spans } = await show("checks", (p) => {
      expandFailing(p)
      p.moveCursor(4)
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
    const { lines, spans } = await show("checks", (p) => {
      expandFailing(p)
      p.moveCursor(7)
    })
    const [, y] = find(lines, "Loading annotations…")
    expect(bgAt(spans, 4, y)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 4, y - 1)).toEqual(ints(theme.base))
  })

  test("say there are none when none are configured", async () => {
    const { lines } = await show("checks", () => {}, { info: prInfo("Adds the skill.") })
    expect(lines.slice(12, 15)).toEqual(["  ▼  Checks (0)", "", "    No checks configured"])
  })
})

describe("the conversation", () => {
  const COLLAPSED = [
    "  ▼  Conversation (7)",
    "",
    "    ▶ PR @dana  I tried this on staging and it works for me. one two                                     👍2 🚀1    6h",
    "    ▶ ✓  @alice  approved                                                                                           5h",
    "    ▶ ✓  @bob  approved                                                                                             4h",
    "    ▶ ✓  @erin  approved                                                                                            3h",
    "    ▶ ✗  @bob  requested changes  (3 threads)                                                                       2h",
    "    ▶ ○  @carol  commented                                                                                          1h",
    "    ▶ PR @deploy-bot[bot]  Deployed to the preview environment.                                                    30m",
    "",
  ]

  test("lists comments and reviews by date, a comment's body cleaned to one line", async () => {
    const { lines } = await show("conversation")
    expect(lines.slice(15, 25)).toEqual(COLLAPSED)
  })

  test("colours who said it, what they said, its reactions and when", async () => {
    const { lines, spans } = await show("conversation")
    expect(fgAt(spans, ...find(lines, "▶ PR @dana"))).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, ...find(lines, "PR @dana"))).toEqual(ints(theme.overlay1))
    expect(fgAt(spans, ...find(lines, "@dana"))).toEqual(ints(theme.sapphire))
    expect(fgAt(spans, ...find(lines, "I tried"))).toEqual(ints(theme.subtext1))
    expect(fgAt(spans, ...find(lines, "👍2"))).toEqual(ints(theme.overlay1))
    expect(fgAt(spans, ...find(lines, "6h"))).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, ...find(lines, "@deploy-bot[bot]"))).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, ...find(lines, "Deployed"))).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, ...find(lines, "✓  @alice"))).toEqual(ints(theme.green))
    expect(fgAt(spans, ...find(lines, "✗  @bob"))).toEqual(ints(theme.red))
    expect(fgAt(spans, ...find(lines, "○  @carol"))).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, ...find(lines, "requested changes"))).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, ...find(lines, "(3 threads)"))).toEqual(ints(theme.overlay0))
  })

  test("marks the selected row on surface0, its author blue and its words in text", async () => {
    const { lines, spans } = await show("conversation", (p) => p.moveCursor(1))
    const [, y] = find(lines, "@dana")
    expect(bgAt(spans, 4, y)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 115, y)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, ...find(lines, "@dana"))).toEqual(ints(theme.blue))
    expect(fgAt(spans, ...find(lines, "I tried"))).toEqual(ints(theme.text))
    expect(bgAt(spans, 4, y + 1)).toEqual(ints(theme.base))
  })

  test("opens a review onto its threads: file:line, replies, resolved; outdated is not marked", async () => {
    const { lines, spans } = await show("conversation", (p) => {
      p.moveCursor(5)
      p.toggleSelectedThread()
    })
    expect(lines.slice(21, 26)).toEqual([
      "    ▼ ✗  @bob  requested changes                                                                                    2h",
      "      ▶  greet.ts:12  @bob  Rename greet to welcome, it reads better in the call sit…                        (3)    1h",
      "      ✓  farewell.ts:3  @bob  Typo here                                                                             2h",
      "      ▶  an-extremely-long-module…:40  @bob  This moved                                                             2h",
      "    ▶ ○  @carol  commented                                                                                          1h",
    ])
    expect(fgAt(spans, ...find(lines, "greet.ts:12"))).toEqual(ints(theme.yellow))
    expect(fgAt(spans, ...find(lines, "✓  farewell"))).toEqual(ints(theme.green))
    expect(fgAt(spans, ...find(lines, "▶  an-extremely"))).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, ...find(lines, "(3)"))).toEqual(ints(theme.overlay0))
  })

  test("opens a thread onto its diff hunk, its body and its replies", async () => {
    const { lines, spans } = await show(
      "conversation",
      (p) => {
        p.moveCursor(5)
        p.toggleSelectedThread()
        p.moveCursor(1)
        p.expandSelectedThread()
      },
      { height: 60 }
    )
    expect(lines.slice(22, 40)).toEqual([
      "      ▼  greet.ts:12  @bob                                                                                          1h",
      "",
      "          @@ -10,3 +10,4 @@ export function greet()",
      "           const a = 1",
      "          -const old = 2",
      "          +const greet = 3",
      "",
      "          Rename greet to welcome, it reads better in the call sites.",
      "",
      "          └ @someone                                                                                                1h",
      "",
      "            Done, renamed.",
      "",
      "          └ @bob                                                                                                    1h",
      "",
      "            Thanks!",
      "",
      "      ✓  farewell.ts:3  @bob  Typo here                                                                             2h",
    ])
    expect(fgAt(spans, ...find(lines, "@@ -10"))).toEqual(ints(theme.blue))
    expect(fgAt(spans, ...find(lines, "const a"))).toEqual(ints(theme.overlay1))
    expect(fgAt(spans, ...find(lines, "-const old"))).toEqual(ints(theme.red))
    expect(fgAt(spans, ...find(lines, "+const greet"))).toEqual(ints(theme.green))
    expect(bgAt(spans, ...find(lines, "@@ -10"))).toEqual(ints(theme.mantle))
    expect(bgAt(spans, 10, 25)).toEqual(ints(theme.mantle))
    expect(fgAt(spans, ...find(lines, "└ @someone"))).toEqual(ints(theme.surface2))
    expect(fgAt(spans, ...find(lines, "@someone", 30))).toEqual(ints(theme.sapphire))
  })

  test("opens a comment and a review onto their full markdown, reactions as pills", async () => {
    const { lines, spans } = await show(
      "conversation",
      (p) => {
        p.moveCursor(1)
        p.toggleSelectedThread()
        p.moveCursor(5)
        p.toggleSelectedThread()
      },
      { height: 60 }
    )
    expect(lines.slice(17, 34)).toEqual([
      "    ▼ PR @dana                                                                                           👍2 🚀1    6h",
      "",
      "        I tried this on staging and it works for me.",
      "        - one",
      "        - two",
      "",
      "         👍 2   🚀 1",
      "    ▶ ✓  @alice  approved                                                                                           5h",
      "    ▶ ✓  @bob  approved                                                                                             4h",
      "    ▶ ✓  @erin  approved                                                                                            3h",
      "    ▶ ✗  @bob  requested changes  (3 threads)                                                                       2h",
      "    ▼ ○  @carol  commented                                                                                          1h",
      "",
      "        Looks fine overall, one question about naming.",
      "",
      "    ▶ PR @deploy-bot[bot]  Deployed to the preview environment.                                                    30m",
      "",
    ])
    expect(fgAt(spans, ...find(lines, "I tried", 18))).toEqual(ints(MARKDOWN_WHITE))
    expect(fgAt(spans, ...find(lines, "👍 2"))).toEqual(ints(theme.subtext1))
    expect(fgAt(spans, ...find(lines, "🚀 1"))).toEqual(ints(theme.blue))
  })

  test("cuts its previews to process.stdout.columns, not to the panel's width", async () => {
    restoreColumns?.()
    restoreColumns = pinStdoutColumns(80)
    const { lines } = await show("conversation", (p) => {
      p.moveCursor(5)
      p.toggleSelectedThread()
    })
    expect(lines[17]).toBe(
      "    ▶ PR @dana  I tried this on staging and it work…                                                     👍2 🚀1    6h"
    )
    expect(lines.slice(22, 25)).toEqual([
      "      ▶  greet.ts:12  @bob  Rename greet to …                                                                (3)    1h",
      "      ✓  farewell.ts:3  @bob  Typo here                                                                             2h",
      "      ▶  an-extremely-l…:40  @bob  This moved                                                                       2h",
    ])
  })
})

describe("files", () => {
  test("list each file with its counts, the selected row on surface0", async () => {
    const { lines, spans } = await show("files", (p) => p.moveCursor(1))
    expect(lines.slice(17, 21)).toEqual([
      "  ▼  Files (2)",
      "",
      "    src/greet.ts       +3    -1",
      "    src/farewell.ts    +5    -0",
    ])
    expect(bgAt(spans, 4, 19)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 115, 19)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, 4, 19)).toEqual(ints(theme.text))
    expect(fgAt(spans, ...find(lines, "+3"))).toEqual(ints(theme.green))
    expect(fgAt(spans, ...find(lines, "-1"))).toEqual(ints(theme.red))
    expect(bgAt(spans, 4, 20)).toEqual(ints(theme.base))
    expect(fgAt(spans, 4, 20)).toEqual(ints(theme.subtext1))
  })

  test("say there are none when nothing changed", async () => {
    const { lines } = await show("files", () => {}, { files: [] })
    expect(lines.slice(17, 20)).toEqual(["  ▼  Files (0)", "", "    No files changed"])
  })
})

describe("commits", () => {
  test("list twenty, then say how many more, the time padded to eight and a long message cut", async () => {
    const { lines } = await show("commits", () => {}, { height: 50 })
    expect(lines.slice(19)).toEqual([
      "  ▼  Commits (23)",
      "",
      // The cut message is still too wide for the row, so the layout
      // squeezes the time column and clips the message's ellipsis.
      "    23h    c00abcd feat: a commit message far longer than any terminal row has room for, so it has to be cut",
      "    22h     c01abcd fix: step 1",
      ...Array.from({ length: 18 }, (_, n) => {
        const i = n + 2
        return `    ${`${23 - i}h`.padEnd(8)}c${String(i).padStart(2, "0")}abcd fix: step ${i}`
      }),
      "    ... +3 more",
    ])
  })

  test("colour the time subtext0, the sha yellow, and the selected sha peach on surface0", async () => {
    const { lines, spans } = await show("commits", (p) => p.moveCursor(2), { height: 50 })
    const [x, y] = find(lines, "c01abcd")
    expect(bgAt(spans, 4, y)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 115, y)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, x, y)).toEqual(ints(theme.peach))
    expect(fgAt(spans, ...find(lines, "fix: step 1"))).toEqual(ints(theme.text))
    expect(fgAt(spans, 4, y)).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, ...find(lines, "c02abcd"))).toEqual(ints(theme.yellow))
    expect(fgAt(spans, ...find(lines, "fix: step 2"))).toEqual(ints(theme.subtext1))
    expect(bgAt(spans, 4, y + 1)).toEqual(ints(theme.base))
    expect(fgAt(spans, ...find(lines, "... +3 more"))).toEqual(ints(theme.overlay0))
  })

  test("say there are none when there are none", async () => {
    const { lines } = await show("commits", () => {}, { info: prInfo("Adds the skill.") })
    expect(lines.slice(18, 21)).toEqual(["  ▼  Commits (0)", "", "    No commits"])
  })
})

describe("the cursor in a section longer than the screen", () => {
  // moveCursor asks for the row to be revealed, but nothing acts on the
  // request, so the row it selects is left below the screen.
  test("is left off screen: the scroll box does not follow it", async () => {
    const { lines } = await show("commits", (p) => p.moveCursor(15), { height: 30 })
    expect(panel!.getScrollBox().scrollTop).toBe(0)
    expect(lines[0]!.trim()).toBe("█")
    expect(lines.join("\n")).not.toContain("c14abcd")
    expect(lines[29]).toContain("c08abcd")
  })
})
