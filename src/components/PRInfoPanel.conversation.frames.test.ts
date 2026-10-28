import { test, expect, describe } from "bun:test"
import { bgAt, fgAt, ints } from "../testing/frame"
import { find, fullPr, MARKDOWN_WHITE, usePrInfoPanel } from "../testing/pr-info-panel"
import type { PRInfoPanelClass } from "./PRInfoPanel"
import { colors, theme } from "../theme"

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
        p.openRow(p.getCursorIndex())
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

  test("moves the cursor through an open thread restyling its rows, the thread's body still drawn on the same frame", async () => {
    const before = await mount({
      section: "conversation",
      prepare: (p) => {
        p.moveCursor(5)
        p.toggleSelectedThread()
        p.moveCursor(1)
        p.openRow(p.getCursorIndex())
      },
      height: 60,
    })
    const { panel, mounted } = before
    expect(bgAt(before.spans, 6, find(before.lines, "greet.ts:12")[1])).toEqual(ints(theme.surface0))

    panel.step(1)
    await mounted.setup.renderOnce()
    const lines = mounted.setup.captureCharFrame().split("\n")
    const spans = mounted.setup.captureSpans()
    const [, thread] = find(lines, "greet.ts:12")
    const [, next] = find(lines, "farewell.ts:3")
    expect(bgAt(spans, 6, thread)).toEqual(ints(theme.base))
    expect(fgAt(spans, ...find(lines, "@bob", thread))).toEqual(ints(theme.sapphire))
    expect(bgAt(spans, 6, next)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 115, next)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, ...find(lines, "@bob", next))).toEqual(ints(theme.blue))
    find(lines, "Rename greet to welcome, it reads better in the call sites.")
    find(lines, "Done, renamed.")
  })

  test("cuts its previews to the width the app says it is drawn at, not to its laid-out width", async () => {
    const { lines } = await mount({
      panelWidth: 80,
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

/** A two-letter label for every row `s` can jump to, in flashTargets() order. */
function labelEveryTarget(panel: PRInfoPanelClass): Map<string, string> {
  const label = (i: number) => String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26))
  return new Map(panel.flashTargets().map((id, i) => [id, label(i)]))
}

describe("flash labels in the conversation", () => {
  test("go in front of collapsed rows and an open review's thread rows, and leave with the labels", async () => {
    const { lines, spans, panel, mounted } = await mount({
      section: "conversation",
      prepare: (p) => {
        p.moveCursor(5)
        p.toggleSelectedThread()
        p.setFlashLabels(labelEveryTarget(p))
      },
    })
    expect(lines.slice(17, 27)).toEqual([
      "    ae ▶ PR @dana  I tried this on staging and it works for me. one two                                  👍2 🚀1    6h",
      "    af ▶ ✓  @alice  approved                                                                                        5h",
      "    ag ▶ ✓  @bob  approved                                                                                          4h",
      "    ah ▶ ✓  @erin  approved                                                                                         3h",
      "    ai ▼ ✗  @bob  requested changes                                                                                 2h",
      "      aj ▶  greet.ts:12  @bob  Rename greet to welcome, it reads better in the call sit…                     (3)    1h",
      "      ak ✓  farewell.ts:3  @bob  Typo here                                                                          2h",
      "      al ▶  an-extremely-long-module…:40  @bob  This moved                                                          2h",
      "    am ▶ ○  @carol  commented                                                                                       1h",
      "    an ▶ PR @deploy-bot[bot]  Deployed to the preview environment.                                                 30m",
    ])
    expect(fgAt(spans, 4, 17)).toEqual(ints(colors.flashLabel))
    expect(fgAt(spans, 7, 17)).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, 6, 22)).toEqual(ints(colors.flashLabel))
    expect(fgAt(spans, 9, 22)).toEqual(ints(theme.subtext0))

    panel.setFlashLabels(new Map())
    const cleared = (await mounted.frame()).split("\n")
    expect(cleared.slice(21, 23)).toEqual([
      "    ▼ ✗  @bob  requested changes                                                                                    2h",
      "      ▶  greet.ts:12  @bob  Rename greet to welcome, it reads better in the call sit…                        (3)    1h",
    ])
    expect(fgAt(mounted.setup.captureSpans(), 4, 17)).toEqual(ints(theme.subtext0))
  })
})

describe("the pending reviewers", () => {
  const REVIEWERS = [
    "frank-the-reviewer",
    "grace-hopper",
    "heidi-klum",
    "ivan-the-terrible",
    "judy-garland",
    "mallory-mallet",
    "niaj-sharma",
    "olivia-pope",
  ]
  const info = () => ({ ...fullPr(), requestedReviewers: REVIEWERS })

  test("sit under one yellow header, their names packed onto as many rows as the terminal needs", async () => {
    const { lines, spans } = await mount({ info: info(), section: "conversation" })
    expect(lines.slice(23, 29)).toEqual([
      "    ▶ PR @deploy-bot[bot]  Deployed to the preview environment.                                                    30m",
      "",
      "    ○ awaiting review (8)",
      "        @frank-the-reviewer  @grace-hopper  @heidi-klum  @ivan-the-terrible  @judy-garland  @mallory-mallet",
      "        @niaj-sharma  @olivia-pope",
      "",
    ])
    expect(fgAt(spans, ...find(lines, "○ awaiting"))).toEqual(ints(theme.yellow))
    expect(fgAt(spans, ...find(lines, "awaiting review"))).toEqual(ints(theme.yellow))
    expect(fgAt(spans, ...find(lines, "@frank"))).toEqual(ints(theme.sapphire))
    expect(fgAt(spans, ...find(lines, "@niaj"))).toEqual(ints(theme.sapphire))
  })

  test("pack to the width the app says the panel is drawn at, not to its laid-out width", async () => {
    const { lines } = await mount({ info: info(), panelWidth: 80, section: "conversation" })
    expect(lines.slice(25, 28)).toEqual([
      "    ○ awaiting review (8)",
      "        @frank-the-reviewer  @grace-hopper  @heidi-klum  @ivan-the-terrible",
      "        @judy-garland  @mallory-mallet  @niaj-sharma  @olivia-pope",
    ])
  })

  test("sit on surface0 as one block when selected, their names blue", async () => {
    const { lines, spans } = await mount({ info: info(), section: "conversation", prepare: (p) => p.moveCursor(8) })
    const [, y] = find(lines, "awaiting review")
    for (const row of [y, y + 1, y + 2]) {
      expect(bgAt(spans, 4, row)).toEqual(ints(theme.surface0))
      expect(bgAt(spans, 115, row)).toEqual(ints(theme.surface0))
    }
    expect(bgAt(spans, 4, y + 3)).toEqual(ints(theme.base))
    expect(fgAt(spans, ...find(lines, "@frank"))).toEqual(ints(theme.blue))
  })

  test("take their flash label in front of the header, as every other row does", async () => {
    const { lines, spans } = await mount({
      info: info(),
      section: "conversation",
      prepare: (p) => p.setFlashLabels(labelEveryTarget(p)),
    })
    const [, y] = find(lines, "awaiting review")
    expect(lines.slice(y - 1, y + 1)).toEqual([
      "",
      "    al ○ awaiting review (8)",
    ])
    expect(fgAt(spans, 4, y)).toEqual(ints(colors.flashLabel))
    expect(fgAt(spans, 7, y)).toEqual(ints(theme.yellow))
  })
})

// The rows a cursor move restyles are drawn from the model, as a rebuild draws them.
describe("rows j moves onto and off", () => {
  async function stepTo(info: ReturnType<typeof fullPr>, steps: number) {
    const { panel, mounted } = await mount({ info, section: "conversation" })
    const press = async () => {
      panel.step(1)
      const lines = (await mounted.frame()).split("\n")
      return { lines, spans: mounted.setup.captureSpans() }
    }
    let shown = await press()
    for (let i = 1; i < steps; i++) shown = await press()
    return { ...shown, press }
  }

  test("keep a review's thread count overlay0, selected and after", async () => {
    const on = await stepTo(fullPr(), 5)
    const [, y] = find(on.lines, "requested changes")
    expect(bgAt(on.spans, 4, y)).toEqual(ints(theme.surface0))
    expect(fgAt(on.spans, ...find(on.lines, "(3 threads)"))).toEqual(ints(theme.overlay0))

    const off = await on.press()
    expect(bgAt(off.spans, 4, y)).toEqual(ints(theme.base))
    expect(fgAt(off.spans, ...find(off.lines, "(3 threads)"))).toEqual(ints(theme.overlay0))
  })

  test("keep the pending reviewers' header yellow, their names blue while selected and sapphire after", async () => {
    const info = { ...fullPr(), requestedReviewers: ["frank-the-reviewer", "grace-hopper"] }
    const on = await stepTo(info, 8)
    const [, y] = find(on.lines, "awaiting review")
    expect(bgAt(on.spans, 4, y)).toEqual(ints(theme.surface0))
    expect(fgAt(on.spans, ...find(on.lines, "○ awaiting"))).toEqual(ints(theme.yellow))
    expect(fgAt(on.spans, ...find(on.lines, "awaiting review"))).toEqual(ints(theme.yellow))
    expect(fgAt(on.spans, ...find(on.lines, "@frank"))).toEqual(ints(theme.blue))
    expect(fgAt(on.spans, ...find(on.lines, "@grace"))).toEqual(ints(theme.blue))

    const off = await on.press()
    expect(bgAt(off.spans, 4, y)).toEqual(ints(theme.base))
    expect(fgAt(off.spans, ...find(off.lines, "awaiting review"))).toEqual(ints(theme.yellow))
    expect(fgAt(off.spans, ...find(off.lines, "@frank"))).toEqual(ints(theme.sapphire))
  })

  test("keep a bot's name overlay0, selected and after", async () => {
    const on = await stepTo(fullPr(), 7)
    const [, y] = find(on.lines, "@deploy-bot[bot]")
    expect(bgAt(on.spans, 4, y)).toEqual(ints(theme.surface0))
    expect(fgAt(on.spans, ...find(on.lines, "@deploy-bot[bot]"))).toEqual(ints(theme.overlay0))

    const off = await on.press()
    expect(bgAt(off.spans, 4, y)).toEqual(ints(theme.base))
    expect(fgAt(off.spans, ...find(off.lines, "@deploy-bot[bot]"))).toEqual(ints(theme.overlay0))
  })
})
