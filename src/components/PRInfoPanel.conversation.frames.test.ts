import { test, expect, describe } from "bun:test"
import { bgAt, fgAt, ints } from "../testing/frame"
import { find, MARKDOWN_WHITE, usePrInfoPanel } from "../testing/pr-info-panel"
import { theme } from "../theme"

// The conversation section opened: comments, reviews, their threads and what each opens onto.

const mount = usePrInfoPanel()

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
    const { lines } = await mount({ section: "conversation" })
    expect(lines.slice(15, 25)).toEqual(COLLAPSED)
  })

  test("colours who said it, what they said, its reactions and when", async () => {
    const { lines, spans } = await mount({ section: "conversation" })
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
    const { lines, spans } = await mount({ section: "conversation", prepare: (p) => p.moveCursor(1) })
    const [, y] = find(lines, "@dana")
    expect(bgAt(spans, 4, y)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 115, y)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, ...find(lines, "@dana"))).toEqual(ints(theme.blue))
    expect(fgAt(spans, ...find(lines, "I tried"))).toEqual(ints(theme.text))
    expect(bgAt(spans, 4, y + 1)).toEqual(ints(theme.base))
  })

  test("opens a review onto its threads: file:line, replies, resolved; outdated is not marked", async () => {
    const { lines, spans } = await mount({
      section: "conversation",
      prepare: (p) => {
        p.moveCursor(5)
        p.toggleSelectedThread()
      },
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
    const { lines, spans } = await mount({
      section: "conversation",
      prepare: (p) => {
        p.moveCursor(5)
        p.toggleSelectedThread()
        p.moveCursor(1)
        p.expandSelectedThread()
      },
      height: 60,
    })
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
    const { lines, spans } = await mount({
      section: "conversation",
      prepare: (p) => {
        p.moveCursor(1)
        p.toggleSelectedThread()
        p.moveCursor(5)
        p.toggleSelectedThread()
      },
      height: 60,
    })
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
    const { lines } = await mount({
      columns: 80,
      section: "conversation",
      prepare: (p) => {
        p.moveCursor(5)
        p.toggleSelectedThread()
      },
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
