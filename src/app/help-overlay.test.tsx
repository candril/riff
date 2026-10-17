import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createHelpOverlayIsland } from "./help-overlay"
import { helpOverlayModel } from "../components/help-overlay-model"
import { bgAt, findText } from "../testing/frame"

let setup: TestRendererSetup | null = null

afterEach(() => {
  setup?.renderer.destroy()
  setup = null
})

async function screen() {
  await setup!.renderOnce()
  await setup!.renderOnce()
  return setup!.captureCharFrame()
}

test("the overlay draws on a model, clears on null, and an identical update keeps its text", async () => {
  setup = await createTestRenderer({ width: 110, height: 70 })
  const island = createHelpOverlayIsland(setup.renderer)
  // A full-screen parent, as render.ts's root box is, for the absolute host to sit in.
  const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" })
  setup.renderer.root.add(parent)
  parent.add(island.host)

  expect((await screen()).trim()).toBe("")
  const empty = setup.captureSpans()

  island.update(helpOverlayModel("9.9.9+test", 0, 70))
  const shown = await screen()
  expect(shown).toContain("Keyboard Shortcuts")
  expect(shown).toContain("riff 9.9.9+test")
  expect(bgAt(setup.captureSpans(), 0, 0)).not.toEqual(bgAt(empty, 0, 0))
  const title = findText(island.host, "Keyboard Shortcuts")
  expect(title).toBeDefined()

  island.update(helpOverlayModel("9.9.9+test", 0, 70))
  expect(await screen()).toBe(shown)
  expect(findText(island.host, "Keyboard Shortcuts")).toBe(title!)

  island.update(null)
  expect((await screen()).trim()).toBe("")
  expect(bgAt(setup.captureSpans(), 0, 0)).toEqual(bgAt(empty, 0, 0))
  island.dispose()
})

test("scrolling a row keeps the rows still in view rather than drawing them anew", async () => {
  setup = await createTestRenderer({ width: 120, height: 40 })
  const island = createHelpOverlayIsland(setup.renderer)
  const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" })
  setup.renderer.root.add(parent)
  parent.add(island.host)

  island.update(helpOverlayModel(undefined, 0, 40))
  expect(await screen()).toContain("Navigation")
  const comments = findText(island.host, "Comments")
  expect(comments).toBeDefined()

  island.update(helpOverlayModel(undefined, 1, 40))
  const scrolled = await screen()
  expect(scrolled).not.toContain("Navigation")
  expect(scrolled).toContain("↑ more · ↓ more")
  expect(findText(island.host, "Comments")).toBe(comments!)
  island.dispose()
})
