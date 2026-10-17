import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createDraftNotificationIsland, createToastIsland } from "./notifications"
import { draftNotificationModel, toastModel } from "../components/notification-model"
import { DRAFT_INNER_WIDTH } from "../components/DraftNotification"
import { bgAt, findText, ints } from "../testing/frame"
import { theme } from "../theme"

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

test("the draft notice ends two rows above the bottom, clears on null, and an identical update keeps its text", async () => {
  setup = await createTestRenderer({ width: 80, height: 24 })
  const island = createDraftNotificationIsland(setup.renderer)
  mount(island.host)

  const model = () =>
    draftNotificationModel(
      { filename: "src/greet.ts", line: 3, side: "RIGHT", bodyPreview: "Rename this.", mtimeMs: 0 },
      DRAFT_INNER_WIDTH
    )
  island.update(model())
  let screen = await rows()
  // Padding row, title, target, one preview line, hint, padding row.
  const last = 24 - 1 - 2
  expect(screen[last - 1]!.trimEnd().endsWith("Ctrl+p: copy or discard it")).toBe(true)
  expect(screen[last - 4]!.indexOf("Claude drafted a comment")).toBe(80 - 2 - 64 + 2)
  expect(screen[last + 1]!.trim()).toBe("")
  const spans = setup.captureSpans()
  expect(bgAt(spans, 80 - 2 - 1, last)).toEqual(ints(theme.mantle))
  expect(bgAt(spans, 80 - 2 - 1, last + 1)).not.toEqual(ints(theme.mantle))
  const title = findText(island.host, "Claude drafted a comment")
  expect(title).toBeDefined()

  island.update(model())
  await rows()
  expect(findText(island.host, "Claude drafted a comment")).toBe(title!)

  island.update(null)
  screen = await rows()
  expect(screen.join("\n")).not.toContain("Claude drafted")
  island.dispose()
})
