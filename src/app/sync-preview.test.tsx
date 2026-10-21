import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createSyncPreviewIsland } from "./sync-preview"
import { syncPreviewModel } from "../components/sync-preview-model"
import type { SyncItem } from "../components/sync-items"
import { bgAt, fgAt, findText, ints } from "../testing/frame"
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

/** A full-screen parent, as the shell's root is, for the absolute host to sit in. */
function mount(host: BoxRenderable) {
  const parent = new BoxRenderable(setup!.renderer, { width: "100%", height: "100%" })
  setup!.renderer.root.add(parent)
  parent.add(host)
}

const ITEMS: SyncItem[] = [
  {
    type: "new",
    comment: {
      id: "n",
      filename: "src/greet.ts",
      line: 3,
      side: "RIGHT",
      body: "Rename this",
      createdAt: "2026-01-10T10:00:00Z",
      status: "local",
    },
  },
]

const model = (loading = false) => syncPreviewModel(ITEMS, { loading, error: null })

test("the preview is centred on the screen, clears on null, and an identical update keeps its text", async () => {
  setup = await createTestRenderer({ width: 80, height: 24 })
  const island = createSyncPreviewIsland(setup.renderer)
  mount(island.host)

  let screen = await rows()
  expect(screen.join("").trim()).toBe("")
  const empty = setup.captureSpans()

  island.update(model())
  screen = await rows()
  // Fourteen rows tall on a 24-row screen: rows 5 to 18.
  const top = 5
  expect(screen[top + 1]!.trimEnd()).toBe("  Sync Changes" + " ".repeat(61) + "esc")
  expect(screen[top + 4]!.trimEnd()).toBe("  New Comments (1)")
  expect(screen[top + 7]!.trimEnd()).toBe("   src/greet.ts:3")
  expect(screen[top + 12]!.trimEnd()).toBe(" ".repeat(63) + "Sync 1 change")
  const spans = setup.captureSpans()
  expect(bgAt(spans, 0, top)).toEqual(ints(theme.mantle))
  expect(bgAt(spans, 79, top + 13)).toEqual(ints(theme.mantle))
  expect(bgAt(spans, 0, top - 1)).not.toEqual(ints(theme.mantle))
  expect(bgAt(spans, 0, top + 14)).not.toEqual(ints(theme.mantle))
  // The rest of the screen is dimmed.
  expect(bgAt(spans, 0, 0)).not.toEqual(bgAt(empty, 0, 0))
  const title = findText(island.host, "Sync Changes")
  const location = findText(island.host, "src/greet.ts:3")
  expect(title).toBeDefined()
  expect(location).toBeDefined()

  island.update(model())
  await rows()
  expect(findText(island.host, "Sync Changes")).toBe(title!)
  expect(findText(island.host, "src/greet.ts:3")).toBe(location!)

  island.update(null)
  screen = await rows()
  expect(screen.join("").trim()).toBe("")
  const cleared = setup.captureSpans()
  expect(cleared.lines.map((_, y) => bgAt(cleared, 0, y))).toEqual(empty.lines.map((_, y) => bgAt(empty, 0, y)))
  island.dispose()
})

test("a changed loading flag flips the footer to Syncing... and greys the button out", async () => {
  setup = await createTestRenderer({ width: 80, height: 24 })
  const island = createSyncPreviewIsland(setup.renderer)
  mount(island.host)
  const footer = 5 + 12

  island.update(model())
  let screen = await rows()
  expect(screen[footer]!.trimEnd()).toBe(" ".repeat(63) + "Sync 1 change")
  let spans = setup.captureSpans()
  expect(bgAt(spans, 63, footer)).toEqual(ints(theme.blue))
  expect(fgAt(spans, 63, footer)).toEqual(ints(theme.base))

  island.update(model(true))
  screen = await rows()
  expect(screen[footer]!.trimEnd()).toBe("  Syncing..." + " ".repeat(51) + "Sync 1 change")
  spans = setup.captureSpans()
  expect(fgAt(spans, 2, footer)).toEqual(ints(theme.yellow))
  expect(bgAt(spans, 63, footer)).toEqual(ints(theme.overlay0))
  expect(fgAt(spans, 63, footer)).toEqual(ints(theme.surface0))

  island.update(model())
  screen = await rows()
  expect(screen[footer]!.trimEnd()).toBe(" ".repeat(63) + "Sync 1 change")
  island.dispose()
})
