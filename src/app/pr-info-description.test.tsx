import { test, expect, afterEach, describe } from "bun:test"
import { MarkdownRenderable, SyntaxStyle } from "@opentui/core"
import { createPrInfoDescriptionIsland, type PrInfoDescriptionIsland } from "./pr-info-description"
import type { DescriptionModel } from "../components/pr-info-description"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { theme } from "../theme"

let mounted: { dispose: () => Promise<void> } | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const BODY = "Adds `greet`.\n\n- one\n- two"

const model = (over: Partial<DescriptionModel> = {}): DescriptionModel => ({
  body: { text: BODY, images: [] },
  reactions: [],
  cursorLine: null,
  ...over,
})

async function mountIsland(height = 10) {
  let island!: PrInfoDescriptionIsland
  const screen = await mountRenderable((renderer) => {
    island = createPrInfoDescriptionIsland(renderer, {
      id: "description-body",
      markdown: { syntaxStyle: SyntaxStyle.fromStyles({}, renderer.nativeScene) },
    })
    return island.host
  }, { width: 30, height })
  mounted = {
    dispose: async () => {
      island.dispose()
      await screen.dispose()
    },
  }
  const render = async () => {
    await screen.setup.renderOnce()
    return { lines: screen.setup.captureCharFrame().split("\n").map((l) => l.trimEnd()), spans: screen.setup.captureSpans() }
  }
  return { island, screen, render }
}

describe("the description island", () => {
  test("reads on the first frame after it is mounted", async () => {
    const { island, render } = await mountIsland()
    island.update(model())
    const { lines } = await render()
    expect(lines.slice(0, 5)).toEqual(["", "  Adds greet.", "", "  - one", "  - two"])
  })

  test("a push that only moves the cursor keeps the markdown body, and moves the cursor row", async () => {
    const { island, screen, render } = await mountIsland()
    island.update(model({ cursorLine: 0 }))
    await screen.frame()
    const root = screen.setup.renderer.root
    const body = root.findDescendantById("description-body")
    expect(body).toBeInstanceOf(MarkdownRenderable)

    island.update(model({ cursorLine: 2 }))
    expect(root.findDescendantById("description-body")).toBe(body!)
    const { lines, spans } = await render()
    expect(lines[3]).toBe("  - one")
    expect(bgAt(spans, 0, 1)).not.toEqual(ints(theme.surface1))
    expect(bgAt(spans, 0, 3)).toEqual(ints(theme.surface1))
    expect(bgAt(spans, 29, 3)).toEqual(ints(theme.surface1))
    expect(fgAt(spans, 4, 3)).not.toEqual(ints(theme.surface1))
  })

  test("updates changed text in place, in the same body", async () => {
    const { island, screen, render } = await mountIsland()
    island.update(model())
    await screen.frame()
    const body = screen.setup.renderer.root.findDescendantById("description-body")

    island.update(model({ body: { text: "Something else entirely.", images: [] } }))
    expect(screen.setup.renderer.root.findDescendantById("description-body")).toBe(body!)
    const { lines } = await render()
    expect(lines.slice(1, 3)).toEqual(["  Something else entirely.", ""])
  })

  test("clamps the cursor row to the last line it draws, and hides it with no cursor line", async () => {
    const { island, screen, render } = await mountIsland()
    island.update(model({ cursorLine: 9 }))
    await screen.frame()
    let { spans } = await render()
    expect(bgAt(spans, 0, 4)).toEqual(ints(theme.surface1))
    expect(bgAt(spans, 0, 5)).not.toEqual(ints(theme.surface1))

    island.update(model())
    ;({ spans } = await render())
    for (const y of [1, 2, 3, 4]) expect(bgAt(spans, 0, y)).not.toEqual(ints(theme.surface1))
  })

  test("says there is no description, then names the pictures and draws the pills", async () => {
    const { island, screen, render } = await mountIsland()
    island.update(model({ body: null, reactions: [{ text: "🚀 1", fg: theme.blue }] }))
    await screen.frame()
    let { lines, spans } = await render()
    expect(lines.slice(1, 3)).toEqual(["  No description provided", "   🚀 1"])
    expect(fgAt(spans, 2, 1)).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, 3, 2)).toEqual(ints(theme.blue))

    island.update(model({ body: { text: "", images: ["Login screen"] } }))
    ;({ lines, spans } = await render())
    expect(lines.slice(1, 3)).toEqual(["  ▣ Login screen", ""])
    expect(fgAt(spans, 2, 1)).toEqual(ints(theme.sapphire))
  })
})
