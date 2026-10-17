import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createHeaderIsland } from "./header"
import { headerModel } from "../components/header-model"
import type { DiffFile } from "../utils/diff-parser"
import { findText, trimFrame } from "../testing/frame"

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

const file = (filename: string): DiffFile => ({ filename, additions: 2, deletions: 1, status: "modified", content: "" })

test("an update with another file redraws its name, and an identical one changes nothing", async () => {
  setup = await createTestRenderer({ width: 60, height: 1 })
  const header = createHeaderIsland(setup.renderer)
  const parent = new BoxRenderable(setup.renderer, { width: "100%", height: 1 })
  setup.renderer.root.add(parent)
  parent.add(header.host)

  header.update({ ...headerModel({ selectedFile: file("src/greet.ts") }), version: "9.9.9" })
  expect(await frame()).toBe(" riff  src/greet.ts" + " ".repeat(28) + "+2 -1  9.9.9")

  header.update({ ...headerModel({ selectedFile: file("src/farewell.ts") }), version: "9.9.9" })
  const changed = await frame()
  expect(changed).toBe(" riff  src/farewell.ts" + " ".repeat(25) + "+2 -1  9.9.9")
  const name = findText(header.host, "src/farewell.ts")
  expect(name).toBeDefined()

  header.update({ ...headerModel({ selectedFile: file("src/farewell.ts") }), version: "9.9.9" })
  expect(await frame()).toBe(changed)
  // A header torn down and rebuilt would draw the same frame.
  expect(findText(header.host, "src/farewell.ts")).toBe(name!)
  header.dispose()
})
