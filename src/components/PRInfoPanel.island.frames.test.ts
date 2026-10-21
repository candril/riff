import { test, expect, describe, mock } from "bun:test"
import { BoxRenderable, MarkdownRenderable, type Renderable } from "@opentui/core"
import type { PRInfoPanelSection } from "../state"
import { bgAt, ints } from "../testing/frame"
import { find, usePrInfoPanel } from "../testing/pr-info-panel"
import { ALL_SECTIONS } from "./pr-info-items"
import { theme } from "../theme"

// The panel is one island: a push restyles what is drawn, and nothing a
// section drew is built again by a move, a Tab or a fold elsewhere.

const mount = usePrInfoPanel()

function descendants(node: Renderable): Renderable[] {
  return node.getChildren().flatMap((child) => [child, ...descendants(child)])
}

/** Every renderable under each section's box, the box first. */
function sectionTrees(root: Renderable): Map<PRInfoPanelSection, Renderable[]> {
  return new Map(
    ALL_SECTIONS.map((section) => {
      const box = root.findDescendantById(`section-${section}`)!
      return [section, [box, ...descendants(box)]]
    })
  )
}

function expectSameTrees(
  before: Map<PRInfoPanelSection, Renderable[]>,
  after: Map<PRInfoPanelSection, Renderable[]>,
  except: PRInfoPanelSection | null = null
) {
  for (const section of ALL_SECTIONS) {
    expect(after.get(section)![0]).toBe(before.get(section)![0]!)
    if (section === except) continue
    const kept = after.get(section)!
    expect(kept).toHaveLength(before.get(section)!.length)
    kept.forEach((node, i) => expect(node).toBe(before.get(section)![i]!))
  }
}

describe("j and k", () => {
  test("in an open list keep the very row renderables and restyle the selected one", async () => {
    const { panel, mounted } = await mount({ section: "files", prepare: (p) => p.moveCursor(1) })
    const root = mounted.setup.renderer.root
    const rows = () => root.findDescendantById("pr-info-files")!.getChildren().filter((child) => child instanceof BoxRenderable)
    const before = rows()
    const [, y] = find((await mounted.frame()).split("\n"), "src/greet.ts")

    panel.moveCursor(1)
    await mounted.frame()
    expect(bgAt(mounted.setup.captureSpans(), 4, y + 1)).toEqual(ints(theme.surface0))
    panel.moveCursor(-1)
    await mounted.frame()
    const spans = mounted.setup.captureSpans()
    expect(bgAt(spans, 4, y)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 4, y + 1)).toEqual(ints(theme.base))
    expect(rows()).toHaveLength(before.length)
    rows().forEach((row, i) => expect(row).toBe(before[i]!))
  })

  test("in the conversation keep every renderable it drew and restyle the selected row", async () => {
    const { panel, mounted } = await mount({ section: "conversation", prepare: (p) => p.moveCursor(1) })
    const root = mounted.setup.renderer.root
    const conversation = root.findDescendantById("pr-info-conversation")!
    const before = descendants(conversation)
    const lines = (await mounted.frame()).split("\n")
    const [, first] = find(lines, "@dana")
    const [, second] = find(lines, "✓  @alice")
    expect(bgAt(mounted.setup.captureSpans(), 4, first)).toEqual(ints(theme.surface0))

    panel.moveCursor(1)
    await mounted.frame()
    const spans = mounted.setup.captureSpans()
    expect(bgAt(spans, 4, first)).toEqual(ints(theme.base))
    expect(bgAt(spans, 4, second)).toEqual(ints(theme.surface0))
    const after = descendants(conversation)
    expect(after).toHaveLength(before.length)
    after.forEach((node, i) => expect(node).toBe(before[i]!))
  })
})

describe("moving between sections and folding one", () => {
  test("crossing a header rebuilds nothing", async () => {
    const { panel, mounted } = await mount({ section: "files" })
    const root = mounted.setup.renderer.root
    const before = sectionTrees(root)

    panel.moveCursor(1)
    await mounted.frame()
    panel.moveCursor(-1)
    await mounted.frame()
    expectSameTrees(before, sectionTrees(root))
  })

  test("Tab to another section rebuilds nothing", async () => {
    const { panel, mounted } = await mount({ section: "files" })
    const root = mounted.setup.renderer.root
    const before = sectionTrees(root)

    panel.cycleSection(1)
    await mounted.frame()
    panel.cycleSection(-1)
    await mounted.frame()
    expectSameTrees(before, sectionTrees(root))
  })

  test("folding and opening a section rebuilds nothing outside it, nor the section's own box", async () => {
    const { panel, mounted } = await mount({ section: "files" })
    const root = mounted.setup.renderer.root
    const before = sectionTrees(root)

    panel.collapseSection()
    await mounted.frame()
    expectSameTrees(before, sectionTrees(root), "files")
    panel.expandSection()
    await mounted.frame()
    expectSameTrees(before, sectionTrees(root))
  })
})

describe("the description folded and opened again", () => {
  test("draws the same frame from the same markdown renderable", async () => {
    const { panel, lines, mounted } = await mount()
    const root = mounted.setup.renderer.root
    const body = root.findDescendantById("pr-info-description")
    expect(body).toBeInstanceOf(MarkdownRenderable)

    panel.collapseSection()
    const folded = (await mounted.frame()).split("\n")
    expect(folded).toContain("  ▶  Description (2)  2 lines")
    expect(folded.join("\n")).not.toContain("Adds the skill.")

    panel.expandSection()
    expect((await mounted.frame()).split("\n")).toEqual(lines)
    expect(root.findDescendantById("pr-info-description")).toBe(body!)
  })
})

describe("the Ctrl-f row", () => {
  test("opens, hands what is typed to the panel's callback, and closes", async () => {
    const typed = mock((_value: string) => {})
    const { panel, lines, mounted } = await mount({ prepare: (p) => p.setOnFilterChange(typed) })
    expect(lines[0]).toBe("")

    panel.syncFilterInput(true, "")
    await mounted.frame()
    expect(mounted.setup.captureCharFrame().split("\n")[0]!.trimEnd()).toBe("  /filter rows…")

    await mounted.setup.mockInput.typeText("gr")
    await mounted.frame()
    expect(mounted.setup.captureCharFrame().split("\n")[0]!.trimEnd()).toBe("  /gr")
    expect(typed.mock.calls.map(([value]) => value)).toEqual(["g", "gr"])

    panel.syncFilterInput(false, "gr")
    await mounted.frame()
    const closed = mounted.setup.captureCharFrame().split("\n").map((line) => line.trimEnd())
    expect(closed[0]).toBe("")
    expect(closed.join("\n")).not.toContain("/gr")
  })
})

describe("destroy", () => {
  test("leaves nothing under the root", async () => {
    const { panel, mounted } = await mount({ section: "conversation" })
    panel.destroy()
    expect(mounted.setup.renderer.root.getChildren()).toHaveLength(0)
  })
})
