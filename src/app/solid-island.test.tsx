import { test, expect, afterEach } from "bun:test"
import { BoxRenderable, TextRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { testRender, useRenderer } from "@opentui/solid"
import { createSignal } from "solid-js"
import { mountSolid } from "./solid-island"
import { discard } from "../utils/renderables"
import { trimFrame } from "../testing/frame"

/*
 * Both directions of spec 100's strangler: a Solid island inside the
 * imperative tree the shell lays out, and one of riff's class renderables
 * inside a Solid tree.
 */

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

test("a Solid island draws inside an imperative box and follows its signal", async () => {
  setup = await createTestRenderer({ width: 20, height: 1 })
  const [label, setLabel] = createSignal("before")
  const island = mountSolid(setup.renderer, () => <text>{label()}</text>, { height: 1 })
  const parent = new BoxRenderable(setup.renderer, { width: "100%", height: 1 })
  setup.renderer.root.add(parent)
  parent.add(island.host)

  expect(await frame()).toBe("before")
  setLabel("after")
  expect(await frame()).toBe("after")

  island.dispose()
  expect(await frame()).toBe("")
})

test("an imperatively built renderable draws as a child of a Solid tree", async () => {
  // M3/M4 depend on this form: the instantiated renderable itself is the JSX child.
  setup = await testRender(
    () => {
      const imperative = new TextRenderable(useRenderer(), { content: "imperative" })
      return <box>{imperative}</box>
    },
    { width: 20, height: 1 }
  )
  expect(await frame()).toBe("imperative")
})

test("the island survives its parent being discarded and moves to the next one", async () => {
  setup = await createTestRenderer({ width: 20, height: 1 })
  const [label, setLabel] = createSignal("first")
  const island = mountSolid(setup.renderer, () => <text>{label()}</text>, { height: 1 })

  const firstParent = new BoxRenderable(setup.renderer, { width: "100%", height: 1 })
  setup.renderer.root.add(firstParent)
  firstParent.add(island.host)
  expect(await frame()).toBe("first")

  discard(firstParent)
  expect(island.host.parent).toBeNull()

  const nextParent = new BoxRenderable(setup.renderer, { width: "100%", height: 1 })
  setup.renderer.root.add(nextParent)
  nextParent.add(island.host)
  setLabel("second")
  expect(await frame()).toBe("second")
  island.dispose()
})
