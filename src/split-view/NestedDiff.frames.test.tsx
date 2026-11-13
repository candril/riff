import { afterEach, describe, expect, test } from "bun:test"
import { ADDITION_BG, DELETION_BG } from "../diff-rows/line-colors"
import { ADDED_NESTED, CONVERSION, MODIFIED_NESTED } from "../features/nested-diff/fixtures"
import { bgAt, fgAt, ints, mountSplit } from "../testing/split-frame"
import { mountUnified } from "../testing/unified-frame"
import { theme } from "../theme"

/*
 * A `.diff` file read as the diff it contains (spec 116): the inner markers
 * are the tint, and what the review did to a line is in the gutter. No
 * parser answers, so text is plain throughout.
 */

type Mounted = { dispose: () => Promise<void> | void }
let mounted: Mounted | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const half = (text: string, side: "left" | "right") => (side === "left" ? text.slice(0, 60) : text.slice(60)).trimEnd()

// The cell after the gutter's line number, where the outer change's bar goes.
const UNIFIED_BAR = 5
const UNIFIED_CODE = 6

describe("unified", () => {
  async function unified(raw: string) {
    const view = await mountUnified({ raw, cursor: { line: 0 } })
    mounted = view
    return { frame: await view.frame(), spans: view.setup.captureSpans() }
  }

  test("an added nested file reads as its inner diff, the markers gone", async () => {
    const { frame } = await unified(ADDED_NESTED)
    expect(frame.split("\n").slice(0, 10).join("\n").trimEnd()).toBe(`\
 ▼   Fetch.md.diff +8 -0 nested
    1 --- observed
    2 +++ contract
    3 # Fetch
    4
    5 \`GET /old\`
    6 \`GET /new\`
    7 | a | b |
    8 Errors: none
      ▸ rest of the file  ↵`)
  })

  test("the inner removal and addition are tinted; an added file's gutter carries no change", async () => {
    const { spans } = await unified(ADDED_NESTED)
    expect(bgAt(spans, UNIFIED_CODE, 5)).toEqual(ints(DELETION_BG))
    expect(bgAt(spans, UNIFIED_CODE, 6)).toEqual(ints(ADDITION_BG))
    expect(fgAt(spans, 2, 6)).toEqual(ints(theme.overlay0))
  })

  test("in a modified file, the review's change is the line number's colour and a bar beside it", async () => {
    const { frame, spans } = await unified(MODIFIED_NESTED)
    const rows = frame.split("\n")
    // `GET /new` was a contract line the review removed; `GET /newer` replaced it.
    expect(rows[5]).toStartWith("    6▌`GET /new`")
    expect(rows[6]).toStartWith("    6▌`GET /newer`")
    expect(fgAt(spans, 4, 5)).toEqual(ints(theme.red))
    expect(fgAt(spans, UNIFIED_BAR, 6)).toEqual(ints(theme.green))
    // Both stay tinted as the contract's, which is what they are inside.
    expect(bgAt(spans, UNIFIED_CODE, 5)).toEqual(ints(ADDITION_BG))
    expect(bgAt(spans, UNIFIED_CODE, 6)).toEqual(ints(ADDITION_BG))
    // A line the review left alone has no bar.
    expect(rows[4]).toStartWith("    5 `GET /old`")
  })
})

describe("split", () => {
  async function split(raw: string) {
    const view = await mountSplit({ raw })
    mounted = view
    return { frame: await view.frame(), spans: view.setup.captureSpans() }
  }

  test("the halves are the inner diff's sides, its header pair the first row", async () => {
    const rows = (await split(ADDED_NESTED)).frame.split("\n")
    expect([half(rows[1]!, "left"), half(rows[1]!, "right")]).toEqual(["    1 --- observed", "    2 +++ contract"])
    expect([half(rows[2]!, "left"), half(rows[2]!, "right")]).toEqual(["    3 # Fetch", "    3 # Fetch"])
    expect([half(rows[4]!, "left"), half(rows[4]!, "right")]).toEqual(["    5 `GET /old`", "    6 `GET /new`"])
    expect([half(rows[6]!, "left"), half(rows[6]!, "right")]).toEqual(["    8 Errors: none", ""])
  })

  test("a review's change lands in the half of the side it changed", async () => {
    const { frame, spans } = await split(MODIFIED_NESTED)
    const rows = frame.split("\n")
    // The contract changed: both versions of its line are on the right, the observed line facing the first.
    expect([half(rows[4]!, "left"), half(rows[4]!, "right")]).toEqual(["    5 `GET /old`", "    6▌`GET /new`"])
    expect([half(rows[5]!, "left"), half(rows[5]!, "right")]).toEqual(["", "    6▌`GET /newer`"])
    expect(fgAt(spans, 60 + 4, 4)).toEqual(ints(theme.red))
    expect(fgAt(spans, 60 + 5, 5)).toEqual(ints(theme.green))
  })

  test("a deleted file is drawn against the inner new side of the .diff that replaced it", async () => {
    const rows = (await split(CONVERSION)).frame.split("\n")
    expect(rows[0]).toContain("Fetch.md +0 -6 vs Fetch.md.diff · contract")
    expect([half(rows[1]!, "left"), half(rows[1]!, "right")]).toEqual(["    1 # Fetch", "    3 # Fetch"])
    expect([half(rows[3]!, "left"), half(rows[3]!, "right")]).toEqual(["    3 `GET /new` [D1](#deviations)", "    6 `GET /new`"])
    expect([half(rows[6]!, "left"), half(rows[6]!, "right")]).toEqual(["    6 | D1 | old route |", ""])
  })
})
