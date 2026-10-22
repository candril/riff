import { afterEach } from "bun:test"
import { SyntaxStyle, type Renderable } from "@opentui/core"
import { createPrInfoPanelIsland, type PrInfoPanelIsland } from "../app/pr-info-panel"
import type { SectionHeaderRow } from "../components/pr-info-header"
import type { PanelSection, SectionBody } from "../components/pr-info-panel-model"
import type { PRInfoPanelSection } from "../state"
import { theme } from "../theme"
import { bgAt, fgAt, mountRenderable, trimFrame } from "./frame"

// The island's own pushes, each view held against the box it is drawn in:
// `inside` reads the frame and the colours from that box's corner, so the
// panel's padding, meta row and separator around it do not move the numbers.

/** The PR info panel island on a screen of its own, torn down after each test. */
export function usePrInfoPanelIsland() {
  let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null
  let island: PrInfoPanelIsland | null = null

  afterEach(async () => {
    // A test that disposes the island itself has already torn it down.
    if (island && !island.host.isDestroyed) island.dispose()
    island = null
    await mounted?.dispose()
    mounted = null
  })

  return async function mountIsland({ width, height }: { width: number; height: number }) {
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
}

const header = (key: PRInfoPanelSection, over: Partial<SectionHeaderRow> = {}): SectionHeaderRow => ({
  key,
  label: null,
  text: `▼  ${key}`,
  fg: theme.blue,
  preview: null,
  trailing: null,
  highlighted: false,
  ...over,
})

export const section = (key: PRInfoPanelSection, body: SectionBody | null): PanelSection => ({
  key,
  header: header(key),
  expanded: body !== null,
  body,
})
