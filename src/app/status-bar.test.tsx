import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createStatusBarIsland } from "./status-bar"
import { trimFrame } from "../testing/frame"

let setup: TestRendererSetup | null = null

afterEach(() => {
  setup?.renderer.destroy()
  setup = null
})

async function frame() {
  await setup!.renderOnce()
  await setup!.renderOnce()
  return trimFrame(setup!.captureCharFrame())
}

test("a patched column readout redraws and keeps the search position a render left", async () => {
  setup = await createTestRenderer({ width: 60, height: 1 })
  const bar = createStatusBarIsland(setup.renderer)
  const parent = new BoxRenderable(setup.renderer, { width: "100%", height: 1 })
  setup.renderer.root.add(parent)
  parent.add(bar.host)

  bar.update({ searchInfo: { current: 2, total: 5, pattern: "x" }, columnInfo: { col: 90, total: 140 } })
  expect(await frame()).toBe("                                            2/5  col 90/140")

  bar.patch({ columnInfo: { col: 1, total: 140 } })
  expect(await frame()).toBe("                                             2/5  col 1/140")

  bar.patch({ columnInfo: null })
  expect(await frame()).toBe("                                                        2/5")
  bar.dispose()
})
