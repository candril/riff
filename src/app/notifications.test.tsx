import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createToastIsland } from "./notifications"
import { toastModel } from "../components/notification-model"
import { findText } from "../testing/frame"

let setup: TestRendererSetup | null = null

afterEach(() => {
  setup?.renderer.destroy()
  setup = null
})

async function rows() {
  await setup!.renderOnce()
  await setup!.renderOnce()
  return setup!.captureCharFrame().split("\n")
}

/** A full-screen parent, as render.ts's root box is, for the absolute host to sit in. */
function mount(host: BoxRenderable) {
  const parent = new BoxRenderable(setup!.renderer, { width: "100%", height: "100%" })
  setup!.renderer.root.add(parent)
  parent.add(host)
}

test("the toast sits at the top right, clears on null, and an identical update keeps its text", async () => {
  setup = await createTestRenderer({ width: 80, height: 24 })
  const island = createToastIsland(setup.renderer)
  mount(island.host)

  island.update(toastModel("Mark a set", "success"))
  let screen = await rows()
  // Two cells of margin, then two of padding.
  expect(screen[1]!.trimEnd()).toBe(" ".repeat(80 - 2 - 2 - "✓ Mark a set".length) + "✓ Mark a set")
  const text = findText(island.host, " Mark a set")
  expect(text).toBeDefined()

  island.update(toastModel("Mark a set", "success"))
  await rows()
  expect(findText(island.host, " Mark a set")).toBe(text!)

  island.update(null)
  screen = await rows()
  expect(screen.join("\n")).not.toContain("Mark a set")
  island.dispose()
})
