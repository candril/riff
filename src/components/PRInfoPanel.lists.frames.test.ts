import { test, expect, describe } from "bun:test"
import { bgAt, fgAt, ints } from "../testing/frame"
import { prInfo } from "../testing/pr-info"
import { find, usePrInfoPanel } from "../testing/pr-info-panel"
import { theme } from "../theme"

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
  // moveCursor asks for the row to be revealed, but nothing acts on the
  // request, so the row it selects is left below the screen.
  test("is left off screen: the scroll box does not follow it", async () => {
    const { lines, panel } = await mount({ section: "commits", prepare: (p) => p.moveCursor(15), height: 30 })
    expect(panel.getScrollBox().scrollTop).toBe(0)
    expect(lines[0]!.trim()).toBe("█")
    expect(lines.join("\n")).not.toContain("c14abcd")
    expect(lines[29]).toContain("c08abcd")
  })
})
