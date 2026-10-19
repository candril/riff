import { test, expect, describe, spyOn } from "bun:test"
import { bgAt, fgAt, ints } from "../testing/frame"
import { commits, prInfo } from "../testing/pr-info"
import { find, usePrInfoPanel } from "../testing/pr-info-panel"
import { theme } from "../theme"
import type { PRInfoPanelClass } from "./PRInfoPanel"

// The files and commits sections opened, and the cursor in a section taller than the screen.

const mount = usePrInfoPanel()

describe("files", () => {
  test("list each file with its counts, the selected row on surface0", async () => {
    const { lines, spans } = await mount({ section: "files", prepare: (p) => p.moveCursor(1) })
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
    const { lines } = await mount({ section: "files", files: [] })
    expect(lines.slice(17, 20)).toEqual(["  ▼  Files (0)", "", "    No files changed"])
  })
})

describe("commits", () => {
  test("list twenty, then say how many more, the time padded to eight and a long message cut", async () => {
    const { lines } = await mount({ section: "commits", height: 50 })
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
    const { lines, spans } = await mount({ section: "commits", prepare: (p) => p.moveCursor(2), height: 50 })
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
    const { lines } = await mount({ section: "commits", info: prInfo("Adds the skill.") })
    expect(lines.slice(18, 21)).toEqual(["  ▼  Commits (0)", "", "    No commits"])
  })
})

describe("the cursor in a section longer than the screen", () => {
  /** The rows the scroll box shows, as [first, last] screen rows. */
  const viewportRows = (panel: PRInfoPanelClass): [number, number] => {
    const viewport = panel.getScrollBox().viewport
    return [viewport.y, viewport.y + viewport.height - 1]
  }

  test("is followed by the scroll box, three rows short of the bottom edge", async () => {
    const { lines, panel } = await mount({ section: "commits", prepare: (p) => p.moveCursor(15), height: 30 })
    expect(panel.getScrollBox().scrollTop).toBeGreaterThan(0)
    const [, y] = find(lines, "c14abcd")
    const [, last] = viewportRows(panel)
    expect(y).toBe(last - 3)
  })

  test("scrolls back up on k, keeping three rows above the cursor", async () => {
    const { panel, mounted } = await mount({ section: "commits", prepare: (p) => p.moveCursor(20), height: 20 })
    for (let i = 0; i < 17; i++) panel.moveCursor(-1)
    const lines = (await mounted.frame()).split("\n")
    const [, y] = find(lines, "c02abcd")
    const [first] = viewportRows(panel)
    expect(panel.getScrollBox().scrollTop).toBeGreaterThan(0)
    expect(y).toBe(first + 3)
  })

  // Under the twenty-row cap, so the row G lands on is the PR's last commit.
  test("shows the last commit after G", async () => {
    const { lines, panel } = await mount({
      info: prInfo("Adds the skill.", { commits: commits(15) }),
      height: 30,
      prepare: (p) => {
        p.setActiveSection("commits")
        p.expandSection()
        p.cycleSection(-1)
        p.jumpToBottom()
      },
    })
    expect(panel.getActiveSection()).toBe("commits")
    const [, y] = find(lines, "c14abcd")
    const [first, last] = viewportRows(panel)
    expect(y).toBeGreaterThanOrEqual(first)
    expect(y).toBeLessThanOrEqual(last)
  })

  // Only twenty of the 23 commits are drawn; the rest are counted in a note.
  test("puts the cursor on the twentieth commit row after G, and j goes no further", async () => {
    const { panel, mounted } = await mount({
      height: 30,
      prepare: (p) => {
        p.setActiveSection("commits")
        p.expandSection()
        p.cycleSection(-1)
        p.jumpToBottom()
      },
    })
    expect(panel.getCursorIndex()).toBe(19)
    expect(panel.moveCursor(1)).toBe(false)
    const lines = (await mounted.frame()).split("\n")
    const [, y] = find(lines, "c19abcd")
    const [first, last] = viewportRows(panel)
    expect(y).toBeGreaterThanOrEqual(first)
    expect(y).toBeLessThanOrEqual(last)
    expect(bgAt(mounted.setup.captureSpans(), 4, y)).toEqual(ints(theme.surface0))
    expect(panel.getSelectedCommit()?.sha).toStartWith("c19")
  })

  // The reveal scrolls inside a frame, after that frame's layout, so only
  // the frame after it shows the scroll.
  describe("asks for one more frame", () => {
    /** Whether drawing one frame after `move` asked for another. */
    async function asksAfterOneFrame(move: (panel: PRInfoPanelClass) => void): Promise<boolean> {
      const { panel, mounted } = await mount({ section: "commits", height: 30 })
      const requestRender = spyOn(mounted.setup.renderer, "requestRender")
      try {
        move(panel)
        requestRender.mockClear()
        await mounted.setup.renderOnce()
        return requestRender.mock.calls.length > 0
      } finally {
        requestRender.mockRestore()
      }
    }

    test("after a move that scrolls", async () => {
      expect(await asksAfterOneFrame((p) => p.moveCursor(15))).toBe(true)
    })

    test("not after a move that does not", async () => {
      expect(await asksAfterOneFrame((p) => p.moveCursor(1))).toBe(false)
    })
  })

  // The commits header starts at the bottom edge, so the cursor steps
  // further down the content than the half page the view scrolls.
  test("stays on screen through Ctrl-d", async () => {
    const { panel, mounted } = await mount({ section: "commits", height: 20 })
    panel.halfPage(1)
    const lines = (await mounted.frame()).split("\n")
    const cursor = panel.getCursorIndex()
    expect(cursor).toBeGreaterThan(0)
    const [, y] = find(lines, `c${String(cursor).padStart(2, "0")}abcd`)
    const [first, last] = viewportRows(panel)
    expect(y).toBeGreaterThanOrEqual(first + 3)
    expect(y).toBeLessThanOrEqual(last - 3)
  })

  // A refreshed panel is handed the reader's scroll position, and a reveal
  // asked for before it would throw that away on the first frame.
  test("keeps a restored scroll position rather than revealing the cursor", async () => {
    const { panel, mounted } = await mount({ section: "commits", height: 30 })
    panel.moveCursor(15)
    panel.restorePosition({ ...panel.capturePosition(), scrollTop: 2 })
    await mounted.frame()
    expect(panel.getCursorIndex()).toBe(14)
    expect(panel.getScrollBox().scrollTop).toBe(2)
  })
})
