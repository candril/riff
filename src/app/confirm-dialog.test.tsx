import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createConfirmDialogIsland } from "./confirm-dialog"
import { confirmDialogModel } from "../components/confirm-dialog-model"
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

const LEFT = (80 - 50) / 2

const model = () =>
  confirmDialogModel({
    title: "Delete comment?",
    message: "This removes it on GitHub.",
    details: "Some details here",
    onConfirm: () => {},
    onCancel: () => {},
  })

test("the dialog is centred on the screen, clears on null, and an identical update keeps its text", async () => {
  setup = await createTestRenderer({ width: 80, height: 24 })
  const island = createConfirmDialogIsland(setup.renderer)
  mount(island.host)

  let screen = await rows()
  expect(screen.join("").trim()).toBe("")
  const empty = setup.captureSpans()

  island.update(model())
  screen = await rows()
  // Eleven rows tall on a 24-row screen: header from row 7, footer ending at row 17.
  const top = 7
  expect(screen[top + 1]!.trimEnd()).toBe(" ".repeat(LEFT + 2) + "Delete comment?")
  expect(screen[top + 4]!.trimEnd()).toBe(" ".repeat(LEFT + 2) + "This removes it on GitHub.")
  expect(screen[top + 6]!.trimEnd()).toBe(" ".repeat(LEFT + 2) + "Some details here")
  expect(screen[top + 9]!.trimEnd()).toBe(" ".repeat(LEFT + 2) + "Yes / no")
  const spans = setup.captureSpans()
  expect(bgAt(spans, LEFT, top)).toEqual(ints(theme.mantle))
  expect(bgAt(spans, LEFT + 49, top + 10)).toEqual(ints(theme.mantle))
  expect(bgAt(spans, LEFT - 1, top)).not.toEqual(ints(theme.mantle))
  expect(bgAt(spans, LEFT + 50, top)).not.toEqual(ints(theme.mantle))
  expect(bgAt(spans, LEFT, top - 1)).not.toEqual(ints(theme.mantle))
  // The rest of the screen is dimmed.
  expect(bgAt(spans, 0, 0)).not.toEqual(bgAt(empty, 0, 0))
  const title = findText(island.host, "Delete comment?")
  expect(title).toBeDefined()

  island.update(model())
  await rows()
  expect(findText(island.host, "Delete comment?")).toBe(title!)

  island.update(null)
  screen = await rows()
  expect(screen.join("").trim()).toBe("")
  const cleared = setup.captureSpans()
  expect(cleared.lines.map((_, y) => bgAt(cleared, 0, y))).toEqual(empty.lines.map((_, y) => bgAt(empty, 0, y)))
  island.dispose()
})
