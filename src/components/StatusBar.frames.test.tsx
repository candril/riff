import { test, expect, describe, afterEach } from "bun:test"
import { mountJsx } from "../testing/frame"
import { StatusBar, type StatusBarProps } from "./StatusBar"

/*
 * What the status bar draws, on a 60-column screen. It pads one cell on
 * either side, so counts end at column 58 and the mode label starts at 1.
 */

let mounted: Awaited<ReturnType<typeof mountJsx>> | null = null

async function frame(props: StatusBarProps) {
  mounted = await mountJsx(
    () => (
      <box width="100%" height={1}>
        <StatusBar {...props} />
      </box>
    ),
    { width: 60, height: 1 }
  )
  return mounted.frame()
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const SEARCH = { current: 2, total: 5, pattern: "x" }
const COLUMN = { col: 90, total: 140 }

test("with nothing to report, the bar is blank", async () => {
  expect(await frame({})).toBe("")
})

describe("search", () => {
  test("the match position sits at the right edge", async () => {
    expect(await frame({ searchInfo: SEARCH })).toBe(
      "                                                        2/5"
    )
  })

  test("a search that wrapped around says so beside the position", async () => {
    expect(await frame({ searchInfo: { ...SEARCH, wrapped: true } })).toBe(
      "                                                      2/5 ↺"
    )
  })

  test("a pattern that matches nothing says so", async () => {
    expect(await frame({ searchInfo: { current: 0, total: 0, pattern: "x" } })).toBe(
      "                                                 No matches"
    )
  })
})

describe("column", () => {
  test("a long line shows how far along it the cursor is", async () => {
    expect(await frame({ columnInfo: COLUMN })).toBe(
      "                                                 col 90/140"
    )
  })

  test("beside a search position, two spaces part them", async () => {
    expect(await frame({ searchInfo: SEARCH, columnInfo: COLUMN })).toBe(
      "                                            2/5  col 90/140"
    )
  })
})

describe("selection", () => {
  test("visual-line mode names itself and counts one line in the singular", async () => {
    expect(await frame({ selectionInfo: { mode: "visual-line", lines: 1 } })).toBe(
      " -- VISUAL LINE --  1 line"
    )
  })

  test("visual mode sits on the left while the counts stay on the right", async () => {
    expect(await frame({
      selectionInfo: { mode: "visual", lines: 3 },
      searchInfo: SEARCH,
      columnInfo: COLUMN,
    })).toBe(" -- VISUAL --  3 lines                      2/5  col 90/140")
  })
})
