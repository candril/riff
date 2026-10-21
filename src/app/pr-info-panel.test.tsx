import { test, expect, afterEach, describe } from "bun:test"
import { MarkdownRenderable, SyntaxStyle, type Renderable } from "@opentui/core"
import { createPrInfoPanelIsland, type PrInfoPanelIsland } from "./pr-info-panel"
import type { ConversationRows } from "../components/pr-info-conversation-rows"
import type { DescriptionModel } from "../components/pr-info-description"
import { panelMeta, sectionHeaderRow, stackLine, type SectionHeaderRow } from "../components/pr-info-header"
import { fileRows } from "../components/pr-info-list-rows"
import type { PanelSection, SectionBody } from "../components/pr-info-panel-model"
import type { SectionConfig } from "../components/pr-info-sections"
import type { PRInfoPanelSection } from "../state"
import { bgAt, fgAt, ints, mountRenderable, trimFrame } from "../testing/frame"
import { opened, dana, reviewers } from "../testing/conversation-rows"
import { ago, prInfo, reviews } from "../testing/pr-info"
import { PR_FILES } from "../testing/pr-info-panel"
import { colors, theme } from "../theme"

// The island's own pushes, each view held against the box it is drawn in:
// `inside` reads the frame and the colours from that box's corner, so the
// panel's padding, meta row and separator around it do not move the numbers.

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null
let island: PrInfoPanelIsland | null = null

afterEach(async () => {
  island?.dispose()
  island = null
  await mounted?.dispose()
  mounted = null
})

async function mountIsland({ width, height }: { width: number; height: number }) {
  mounted = await mountRenderable((renderer) => {
    island = createPrInfoPanelIsland(renderer, {
      markdown: { syntaxStyle: SyntaxStyle.fromStyles({}, renderer.nativeScene) },
      onFilterInput: () => {},
      beforeScrollRender: () => {},
      onDescriptionResize: () => {},
    })
    return island.host
  }, { width, height })
  const screen = mounted
  const root = screen.setup.renderer.root
  const byId = (id: string) => root.findDescendantById(id)!

  /** The frame and spans from `above` rows over `node`'s corner, `rows` high and as wide as the node. */
  const inside = async (node: () => Renderable, rows: number, renders = 2, above = 0) => {
    for (let i = 0; i < renders; i++) await screen.setup.renderOnce()
    const found = node()
    const box = { x: found.x, y: found.y - above, width: found.width }
    const lines = screen.setup
      .captureCharFrame()
      .split("\n")
      .slice(box.y, box.y + rows)
      .map((line) => line.slice(box.x, box.x + box.width))
    const spans = screen.setup.captureSpans()
    return {
      frame: trimFrame(lines.join("\n")),
      lines: lines.map((line) => line.trimEnd()),
      bg: (x: number, y: number) => bgAt(spans, box.x + x, box.y + y),
      fg: (x: number, y: number) => fgAt(spans, box.x + x, box.y + y),
    }
  }
  return { island: island!, screen, root, byId, inside }
}

const header = (key: PRInfoPanelSection, over: Partial<SectionHeaderRow> = {}): SectionHeaderRow => ({
  key,
  label: null,
  text: `▼  ${key}`,
  fg: theme.blue,
  preview: null,
  highlighted: false,
  ...over,
})

const section = (key: PRInfoPanelSection, body: SectionBody | null): PanelSection => ({
  key,
  header: header(key),
  expanded: body !== null,
  body,
})

describe("a list section", () => {
  const files = (selected: number, labels: ReadonlyMap<string, string> = new Map()): PanelSection[] => [
    section("files", { kind: "list", rows: fileRows(PR_FILES, { selected, labels, listWidth: 93 }) }),
  ]

  // The list's box is 40 wide on a 46-wide screen: the scroll box's padding and the body's indent.
  test("a push draws a row per item, the selected one on surface0", async () => {
    const { island, byId, inside } = await mountIsland({ width: 46, height: 14 })
    island.update({ sections: files(0) })
    const { frame, bg, fg } = await inside(() => byId("pr-info-files"), 4)
    expect(frame).toBe(["src/greet.ts       +3    -1", "src/farewell.ts    +5    -0"].join("\n"))
    expect(bg(0, 0)).toEqual(ints(theme.surface0))
    expect(bg(39, 0)).toEqual(ints(theme.surface0))
    expect(fg(0, 0)).toEqual(ints(theme.text))
    expect(fg(19, 0)).toEqual(ints(theme.green))
    expect(fg(25, 0)).toEqual(ints(theme.red))
    expect(fg(0, 1)).toEqual(ints(theme.subtext1))
  })

  test("a second push moves the selection onto the same row renderables, and labels a row", async () => {
    const { island, byId, inside } = await mountIsland({ width: 46, height: 14 })
    island.update({ sections: files(0) })
    await inside(() => byId("pr-info-files"), 4)
    const first = island.rowAt("files", 0)
    const second = island.rowAt("files", 1)

    island.update({ sections: files(1, new Map([["files:1", "sd"]])) })
    const { lines, bg, fg } = await inside(() => byId("pr-info-files"), 4)
    expect(lines[1]).toBe("sd src/farewell.ts    +5    -0")
    expect(island.rowAt("files", 0)).toBe(first)
    expect(island.rowAt("files", 1)).toBe(second)
    expect(bg(0, 0)).not.toEqual(ints(theme.surface0))
    expect(fg(0, 0)).toEqual(ints(theme.subtext1))
    expect(bg(0, 1)).toEqual(ints(theme.surface0))
    expect(fg(0, 1)).toEqual(ints(colors.flashLabel))
    expect(fg(3, 1)).toEqual(ints(theme.text))
  })

  test("the note stands alone when there are no rows, and is no row", async () => {
    const { island, byId, inside } = await mountIsland({ width: 46, height: 14 })
    island.update({ sections: [section("files", { kind: "list", rows: fileRows([], { selected: -1, labels: new Map(), listWidth: 93 }) })] })
    expect((await inside(() => byId("pr-info-files"), 4)).frame).toBe("No files changed")
    expect(island.rowAt("files", 0)).toBeUndefined()
  })

  test("dispose destroys the host and leaves the screen empty", async () => {
    const { island: shown, screen } = await mountIsland({ width: 46, height: 14 })
    shown.update({ sections: files(0) })
    await screen.frame()
    shown.dispose()
    island = null
    expect(shown.host.isDestroyed).toBe(true)
    expect(screen.setup.renderer.root.getChildren()).toHaveLength(0)
    expect(await screen.frame()).toBe("")
  })
})

describe("a section header", () => {
  const checks: SectionConfig = { id: "checks", title: "Checks", count: 6, preview: "✗ 4 failed", hasItems: true }

  test("follows each push: expanded and highlighted, then collapsed with a label", async () => {
    const { island, byId, inside } = await mountIsland({ width: 44, height: 10 })
    const row = (state: Parameters<typeof sectionHeaderRow>[1]): PanelSection[] => [
      { key: "checks", header: sectionHeaderRow(checks, state), expanded: state.expanded, body: null },
    ]

    island.update({ sections: row({ active: true, expanded: true, highlighted: true, label: null }) })
    let drawn = await inside(() => byId("pr-info-header-checks"), 1)
    expect(drawn.frame).toBe("▼  Checks (6)")
    expect(drawn.fg(0, 0)).toEqual(ints(theme.blue))
    expect(drawn.bg(0, 0)).toEqual(ints(theme.surface0))
    expect(drawn.bg(39, 0)).toEqual(ints(theme.surface0))

    island.update({ sections: row({ active: false, expanded: false, highlighted: false, label: "a" }) })
    drawn = await inside(() => byId("pr-info-header-checks"), 1)
    expect(drawn.frame).toBe("a ▶  Checks (6)  ✗ 4 failed")
    expect(drawn.fg(0, 0)).toEqual(ints(colors.flashLabel))
    expect(drawn.fg(2, 0)).toEqual(ints(theme.overlay0))
    expect(drawn.fg(18, 0)).toEqual(ints(theme.subtext0))
    expect(drawn.bg(0, 0)).not.toEqual(ints(theme.surface0))
  })
})

describe("the meta row", () => {
  test("follows each push: approvers and stack line come and go", async () => {
    const { island, byId, inside } = await mountIsland({ width: 84, height: 10 })

    island.update({ meta: { meta: panelMeta(prInfo("", { reviews: reviews() })), stack: stackLine(undefined) } })
    let drawn = await inside(() => byId("pr-info-meta"), 2)
    expect(drawn.frame).toBe("@someone  a-branch → master   ✓ @alice @erin")
    expect(drawn.fg(0, 0)).toEqual(ints(theme.blue))
    expect(drawn.fg(10, 0)).toEqual(ints(theme.subtext0))
    expect(drawn.fg(30, 0)).toEqual(ints(theme.green))

    const superseded = [
      ...reviews(),
      { id: "PRR_alice2", author: "alice", state: "CHANGES_REQUESTED" as const, submittedAt: ago(1) },
    ]
    island.update({
      meta: {
        meta: panelMeta(prInfo("", { reviews: superseded })),
        stack: stackLine({ basePr: { number: 1200, title: "Base work" }, status: "rewritten", behindBy: 2 }),
      },
    })
    drawn = await inside(() => byId("pr-info-meta"), 2)
    expect(drawn.frame).toBe(
      ["@someone  a-branch → master   ✓ @erin", "stacked on #1200 Base work · base rewritten since you branched — rebase"].join("\n")
    )
    expect(drawn.fg(0, 1)).toEqual(ints(theme.yellow))

    island.update({ meta: { meta: panelMeta(prInfo("")), stack: stackLine(null) } })
    expect((await inside(() => byId("pr-info-meta"), 2)).frame).toBe("@someone  a-branch → master")
  })
})

describe("the description", () => {
  const BODY = "Adds `greet`.\n\n- one\n- two"
  const description = (over: Partial<DescriptionModel> = {}): PanelSection[] => [
    section("description", {
      kind: "description",
      model: { body: { text: BODY, images: [] }, reactions: [], cursorLine: null, ...over },
    }),
  ]

  // The description's box, padding included, is 30 wide on a 34-wide screen,
  // read from the margin row above it.
  async function mountDescription() {
    const shown = await mountIsland({ width: 34, height: 20 })
    const at = (renders = 1) => shown.inside(() => shown.island.descriptionBox()!, 10, renders, 1)
    return { ...shown, at }
  }

  test("reads on the first frame after it is mounted", async () => {
    const { island, at } = await mountDescription()
    island.update({ sections: description() })
    expect((await at()).lines.slice(0, 5)).toEqual(["", "  Adds greet.", "", "  - one", "  - two"])
  })

  test("a push that only moves the cursor keeps the markdown body, and moves the cursor row", async () => {
    const { island, byId, at } = await mountDescription()
    island.update({ sections: description({ cursorLine: 0 }) })
    await at(2)
    const body = byId("pr-info-description")
    expect(body).toBeInstanceOf(MarkdownRenderable)

    island.update({ sections: description({ cursorLine: 2 }) })
    expect(byId("pr-info-description")).toBe(body)
    const { lines, bg, fg } = await at()
    expect(lines[3]).toBe("  - one")
    expect(bg(0, 1)).not.toEqual(ints(theme.surface1))
    expect(bg(0, 3)).toEqual(ints(theme.surface1))
    expect(bg(29, 3)).toEqual(ints(theme.surface1))
    expect(fg(4, 3)).not.toEqual(ints(theme.surface1))
  })

  test("updates changed text in place, in the same body", async () => {
    const { island, byId, at } = await mountDescription()
    island.update({ sections: description() })
    await at(2)
    const body = byId("pr-info-description")

    island.update({ sections: description({ body: { text: "Something else entirely.", images: [] } }) })
    expect(byId("pr-info-description")).toBe(body)
    expect((await at()).lines.slice(1, 3)).toEqual(["  Something else entirely.", ""])
  })

  test("clamps the cursor row to the last line it draws, and hides it with no cursor line", async () => {
    const { island, at } = await mountDescription()
    island.update({ sections: description({ cursorLine: 9 }) })
    await at(2)
    let { bg } = await at()
    expect(bg(0, 4)).toEqual(ints(theme.surface1))
    expect(bg(0, 5)).not.toEqual(ints(theme.surface1))

    island.update({ sections: description() })
    ;({ bg } = await at())
    for (const y of [1, 2, 3, 4]) expect(bg(0, y)).not.toEqual(ints(theme.surface1))
  })

  test("says there is no description, then names the pictures and draws the pills", async () => {
    const { island, at } = await mountDescription()
    island.update({ sections: description({ body: null, reactions: [{ text: "🚀 1", fg: theme.blue }] }) })
    await at(2)
    let { lines, fg } = await at()
    expect(lines.slice(1, 3)).toEqual(["  No description provided", "   🚀 1"])
    expect(fg(2, 1)).toEqual(ints(theme.overlay0))
    expect(fg(3, 2)).toEqual(ints(theme.blue))

    island.update({ sections: description({ body: { text: "", images: ["Login screen"] } }) })
    ;({ lines, fg } = await at())
    expect(lines.slice(1, 3)).toEqual(["  ▣ Login screen", ""])
    expect(fg(2, 1)).toEqual(ints(theme.sapphire))
  })
})

describe("the conversation", () => {
  const conversation = (rows: ConversationRows): PanelSection[] => [
    section("conversation", { kind: "conversation", rows }),
  ]

  // The conversation's box is 44 wide on a 50-wide screen.
  async function mountConversation() {
    const shown = await mountIsland({ width: 50, height: 30 })
    const at = (renders = 2) => shown.inside(() => shown.byId("pr-info-conversation"), 14, renders)
    return { ...shown, at }
  }

  test("a push that only moves the cursor keeps the markdown body it drew, and its text on the next render", async () => {
    const { island, byId, at } = await mountConversation()
    island.update({ sections: conversation(opened(true)) })
    await at()
    const body = byId("pr-comment-501")
    expect(body).toBeInstanceOf(MarkdownRenderable)

    island.update({ sections: conversation(opened(false)) })
    expect(byId("pr-comment-501")).toBe(body)
    const { lines, bg } = await at(1)
    expect(lines[2]).toBe("    Rename greet to welcome.")
    expect(lines[4]).toBe("    - one")
    expect(bg(0, 0)).not.toEqual(ints(theme.surface0))
    expect(bg(0, 9)).toEqual(ints(theme.surface0))
  })

  test("finds each row's drawn header past the body boxes between them", async () => {
    const { island, byId, at } = await mountConversation()
    island.update({ sections: conversation(opened(true)) })
    await at()
    const top = byId("pr-info-conversation").y
    expect(island.rowAt("conversation", 0)!.y - top).toBe(0)
    expect(island.rowAt("conversation", 1)!.y - top).toBe(9)
    expect(island.rowAt("conversation", 1)!.height).toBe(1)
    expect(island.rowAt("conversation", 2)).toBeUndefined()

    island.update({ sections: conversation({ rows: [reviewers(false)], note: null }) })
    await at()
    expect(island.rowAt("conversation", 0)!.y - top).toBe(1)
    expect(island.rowAt("conversation", 0)!.height).toBe(3)
  })

  test("drops a body whose row closed", async () => {
    const { island, root, at } = await mountConversation()
    island.update({ sections: conversation(opened(true)) })
    await at()
    island.update({ sections: conversation({ rows: [dana()], note: null }) })
    expect((await at()).frame).toBe("▶ @dana  a preview far too long for       6h")
    expect(root.findDescendantById("pr-comment-501")).toBeUndefined()
  })
})
