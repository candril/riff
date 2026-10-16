import { test, expect, describe, afterEach, spyOn } from "bun:test"
import { TextRenderable, type Renderable } from "@opentui/core"
import * as segmentsModule from "../diff-rows/segments"
import * as visualRowsModule from "../diff-rows/visual-rows"
import * as layoutModule from "./layout"
import { mountUnified } from "../testing/unified-frame"

/*
 * What the unified view rebuilds when the cursor or the scroll moves. A
 * frame test cannot see this: a row recreated to the same cells draws the
 * same frame, it only costs the time.
 */

const LINES = 40
const HEIGHT = 12
const context = Array.from({ length: LINES }, (_, n) => ` const value${n} = compute(input${n})`)
const RAW = `diff --git a/long.ts b/long.ts
index 1111111..2222222 100644
--- a/long.ts
+++ b/long.ts
@@ -1,${LINES} +1,${LINES} @@
${context.join("\n")}
`

const buildSegments = spyOn(segmentsModule, "buildSegments")
const lineWrapper = spyOn(visualRowsModule, "lineWrapper")
const unifiedOrigins = spyOn(layoutModule, "unifiedOrigins")
let mounted: Awaited<ReturnType<typeof mountUnified>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

function renderables(root: Renderable): Set<Renderable> {
  const found = new Set<Renderable>()
  const walk = (node: Renderable) => {
    found.add(node)
    for (const child of node.getChildren()) walk(child as Renderable)
  }
  walk(root)
  return found
}

async function mount() {
  mounted = await mountUnified({ raw: RAW, width: 120, height: HEIGHT, cursor: { line: 3 } })
  expect(await mounted.frame()).toContain("const value0 = compute(input0)")
  buildSegments.mockClear()
  return mounted
}

describe("a row is kept, not recreated, when what it draws stays", () => {
  test("moving the cursor a line keeps every row, rebuilding only the code of the two lines it touched", async () => {
    const view = await mount()
    const before = renderables(view.setup.renderer.root)
    view.set("cursor", { line: 4 })
    await view.setup.renderOnce()
    const after = renderables(view.setup.renderer.root)

    // Only the code of the line it left and the line it entered is new: its background, and so
    // its word diff's, changed. Every box, gutter and other line's text is the one drawn before.
    const fresh = [...after].filter((node) => !before.has(node))
    expect(fresh.map((node) => node instanceof TextRenderable)).toEqual([true, true])
    expect(after.size).toBe(before.size)
    expect(buildSegments.mock.calls.length).toBe(2)
  })

  test("scrolling a line builds only the line that came into view", async () => {
    const view = await mount()
    view.set("scrollTop", 1)
    await view.setup.renderOnce()
    expect(buildSegments.mock.calls.length).toBe(1)
  })
})

describe("what a sideways scroll or a resize leaves alone", () => {
  test("scrolling sideways moves the markers without rebuilding any line's code", async () => {
    const view = await mount()
    view.set("column", 5)
    expect(await view.frame()).toContain("‹")
    expect(buildSegments.mock.calls.length).toBe(0)
  })

  test("unwrapped, a resize neither wraps anew nor sizes the gutter again", async () => {
    const view = await mount()
    lineWrapper.mockClear()
    unifiedOrigins.mockClear()
    view.set("width", 100)
    await view.setup.renderOnce()
    expect(lineWrapper.mock.calls.length).toBe(0)
    expect(unifiedOrigins.mock.calls.length).toBe(0)
  })

  test("wrapped, a resize wraps at the new width", async () => {
    const view = await mount()
    view.set("wrap", true)
    await view.setup.renderOnce()
    lineWrapper.mockClear()
    unifiedOrigins.mockClear()
    view.set("width", 100)
    await view.setup.renderOnce()
    expect(lineWrapper.mock.calls.length).toBe(1)
    expect(unifiedOrigins.mock.calls.length).toBe(1)
  })
})
