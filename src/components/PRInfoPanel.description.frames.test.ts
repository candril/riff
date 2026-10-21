import { test, expect, describe } from "bun:test"
import { bgAt, fgAt, ints } from "../testing/frame"
import { prInfo } from "../testing/pr-info"
import { find, MARKDOWN_WHITE, usePrInfoPanel } from "../testing/pr-info-panel"
import type { PRInfoPanelClass } from "./PRInfoPanel"
import type { ReactionSummary } from "../types"
import { theme } from "../theme"

// The description section: its body, the pictures it names, its reactions and its cursor row.

const mount = usePrInfoPanel()

const REACTIONS: ReactionSummary[] = [
  { content: "+1", count: 3, viewerHasReacted: false },
  { content: "rocket", count: 1, viewerHasReacted: true },
]
// The shape GitHub's web UI pastes a screenshot in.
const SCREENSHOT = '<img width="1035" height="270" alt="Login screen" src="https://github.com/user-attachments/assets/c0d9674a" />'
const FOUR_LINES = "one\n\ntwo\n\nthree\nfour"
// Where the description's first line is drawn.
const FIRST = 8

/** j `times` times, a frame after each, as a reader pressing it would get. */
async function press(panel: PRInfoPanelClass, frame: () => Promise<string>, times: number, delta: 1 | -1 = 1) {
  let lines: string[] = []
  for (let i = 0; i < times; i++) {
    panel.step(delta)
    lines = (await frame()).split("\n")
  }
  return lines
}

describe("the description", () => {
  test("says there is none for an empty body", async () => {
    const { lines, spans } = await mount({ info: prInfo(""), comments: [] })
    expect(lines.slice(6, 10)).toEqual(["  ▼  Description (0)", "", "    No description provided", ""])
    expect(fgAt(spans, ...find(lines, "No description provided"))).toEqual(ints(theme.overlay0))
  })

  test("says there is none for a body of whitespace, its reactions still under it", async () => {
    const { lines, spans } = await mount({ info: prInfo("  \n\n ", { bodyReactions: REACTIONS }), comments: [] })
    expect(lines.slice(FIRST, FIRST + 3)).toEqual(["    No description provided", "     👍 3   🚀 1", ""])
    expect(fgAt(spans, 4, FIRST)).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, 5, FIRST + 1)).toEqual(ints(theme.subtext1))
    expect(fgAt(spans, 12, FIRST + 1)).toEqual(ints(theme.blue))
  })

  test("draws the prose, then the pictures it carried by name in sapphire, then its reactions as padded pills", async () => {
    const body = `Adds the **skill**.\n\n${SCREENSHOT}\n\nSecond line.\n\n![chart](https://example.com/chart.png)`
    const { lines, spans } = await mount({ info: prInfo(body, { bodyReactions: REACTIONS }), comments: [] })
    expect(lines.slice(6, 15)).toEqual([
      "  ▼  Description (4)",
      "",
      "    Adds the skill.",
      "    Second line.",
      "    ▣ Login screen",
      "    ▣ chart",
      // One cell of padding each side of a pill and one between them: 👍 is two cells wide.
      "     👍 3   🚀 1",
      "",
      "  ▶  Previews (0)",
    ])
    expect(fgAt(spans, 4, FIRST)).toEqual(ints(MARKDOWN_WHITE))
    expect(fgAt(spans, ...find(lines, "▣ Login screen"))).toEqual(ints(theme.sapphire))
    expect(fgAt(spans, ...find(lines, "▣ chart"))).toEqual(ints(theme.sapphire))
    expect(fgAt(spans, 5, FIRST + 4)).toEqual(ints(theme.subtext1))
    expect(fgAt(spans, 7, FIRST + 4)).toEqual(ints(theme.subtext1))
    expect(fgAt(spans, 12, FIRST + 4)).toEqual(ints(theme.blue))
    expect(fgAt(spans, 14, FIRST + 4)).toEqual(ints(theme.blue))
  })

  test("draws a body that was only a picture as the picture's name alone", async () => {
    const { lines } = await mount({ info: prInfo(SCREENSHOT), comments: [] })
    expect(lines.slice(6, 10)).toEqual(["  ▼  Description (1)", "", "    ▣ Login screen", ""])
  })
})

describe("the description's cursor row", () => {
  test("sits under the line j has reached, the text on it keeping its colour", async () => {
    for (const n of [0, 1, 3]) {
      const { panel, mounted } = await mount({ info: prInfo(FOUR_LINES), comments: [] })
      await press(panel, mounted.frame, n + 1)
      const spans = mounted.setup.captureSpans()
      expect(panel.getCursorIndex()).toBe(n)
      for (let line = 0; line < 4; line++) {
        const bg = line === n ? theme.surface1 : theme.base
        expect(bgAt(spans, 4, FIRST + line)).toEqual(ints(bg))
      }
      expect(bgAt(spans, 1, FIRST + n)).toEqual(ints(theme.base))
      expect(bgAt(spans, 2, FIRST + n)).toEqual(ints(theme.surface1))
      expect(bgAt(spans, 117, FIRST + n)).toEqual(ints(theme.surface1))
      expect(bgAt(spans, 118, FIRST + n)).toEqual(ints(theme.base))
      expect(fgAt(spans, 4, FIRST + n)).toEqual(ints(MARKDOWN_WHITE))
      expect(fgAt(spans, 5, FIRST + n)).toEqual(ints(MARKDOWN_WHITE))
    }
  })

  test("is not drawn while the cursor is on the section's header", async () => {
    const { panel, mounted } = await mount({ info: prInfo(FOUR_LINES), comments: [] })
    await press(panel, mounted.frame, 2)
    await press(panel, mounted.frame, 2, -1)
    expect(panel.isOnSectionHeader()).toBe(true)
    const spans = mounted.setup.captureSpans()
    for (let line = 0; line < 4; line++) expect(bgAt(spans, 4, FIRST + line)).toEqual(ints(theme.base))
  })

  test("is not drawn while another section has the cursor", async () => {
    const { panel, mounted } = await mount({ info: prInfo(FOUR_LINES), comments: [] })
    await press(panel, mounted.frame, 3)
    panel.setActiveSection("checks")
    await mounted.frame()
    const spans = mounted.setup.captureSpans()
    for (let line = 0; line < 4; line++) expect(bgAt(spans, 4, FIRST + line)).toEqual(ints(theme.base))
  })

  test("stands on the last line of a body that got shorter under it", async () => {
    const { panel, mounted } = await mount({ info: prInfo(FOUR_LINES), comments: [] })
    await press(panel, mounted.frame, 4)
    expect(panel.getCursorIndex()).toBe(3)

    panel.setPrInfo(prInfo("alpha\n\nbeta"))
    const lines = (await mounted.frame()).split("\n")
    const spans = mounted.setup.captureSpans()
    expect(lines.slice(FIRST, FIRST + 3)).toEqual(["    alpha", "    beta", ""])
    expect(bgAt(spans, 4, FIRST)).toEqual(ints(theme.base))
    expect(bgAt(spans, 4, FIRST + 1)).toEqual(ints(theme.surface1))
    expect(fgAt(spans, 4, FIRST + 1)).toEqual(ints(MARKDOWN_WHITE))
    expect(bgAt(spans, 4, FIRST + 2)).toEqual(ints(theme.base))
  })

  for (const [name, body] of [["one line", "alpha"], ["no body", ""]] as const) {
    test(`takes the cursor back onto the last line when the body shrinks to ${name}`, async () => {
      const { panel, mounted } = await mount({ info: prInfo(FOUR_LINES), comments: [] })
      await press(panel, mounted.frame, 3)
      expect(panel.getCursorIndex()).toBe(2)

      panel.setPrInfo(prInfo(body))
      await mounted.frame()
      expect(panel.getCursorIndex()).toBeLessThanOrEqual(panel.getMaxCursorIndex())
      expect(panel.getCursorIndex()).toBe(0)
      const lines = await press(panel, mounted.frame, 1, -1)
      expect(panel.getCursorIndex()).toBe(-1)
      expect(lines[FIRST - 2]).toStartWith("  ▼  Description")
    })
  }

  test("stops at the last drawn line, reactions included, going down and coming back up into it", async () => {
    const body = `Adds the **skill**.\n\n${SCREENSHOT}`
    const { panel, mounted } = await mount({ info: prInfo(body, { bodyReactions: REACTIONS }), comments: [] })
    await press(panel, mounted.frame, 1)
    expect(panel.getMaxCursorIndex()).toBe(2)
    panel.moveCursor(10)
    await mounted.frame()
    expect(panel.getCursorIndex()).toBe(2)
    expect(bgAt(mounted.setup.captureSpans(), 2, FIRST + 2)).toEqual(ints(theme.surface1))

    panel.setActiveSection("previews")
    await mounted.frame()
    await press(panel, mounted.frame, 1, -1)
    expect(panel.getActiveSection()).toBe("description")
    expect(panel.getCursorIndex()).toBe(2)
    const spans = mounted.setup.captureSpans()
    expect(bgAt(spans, 2, FIRST + 2)).toEqual(ints(theme.surface1))
    expect(bgAt(spans, 2, FIRST + 3)).toEqual(ints(theme.base))
  })
})
