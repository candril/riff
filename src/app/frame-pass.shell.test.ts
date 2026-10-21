import { test, expect, afterEach } from "bun:test"
import type { Renderable } from "@opentui/core"
import { mountApp } from "../testing/app-render"

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
diff --git a/README.md b/README.md
index 3333333..4444444 100644
--- a/README.md
+++ b/README.md
@@ -1,2 +1,3 @@
 # riff
+A diff reviewer.
 
`

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** What sits in the view slot: the one child of the box beside the tree's. */
function viewSlotChild(root: Renderable): Renderable | undefined {
  const row = root.getChildren()[1]!.getChildren()[0]!
  return row.getChildren()[1]!.getChildren()[0]
}

function treeSlot(root: Renderable): Renderable {
  const row = root.getChildren()[1]!.getChildren()[0]!
  return row.getChildren()[0]!
}

test("two passes leave every piece of the layout the same instance", async () => {
  app = await mountApp(DIFF, { width: 100, height: 16 })
  const { renderer } = app.setup
  app.show()
  const first = {
    root: renderer.root.getChildren(),
    view: viewSlotChild(app.ctx.shell.root),
    header: app.islands.header.host.parent,
    status: app.statusBar.host.parent,
    tree: app.fileTreePanel.host.parent,
  }
  app.show({ showHelp: true })
  app.show({ showHelp: false })
  expect(renderer.root.getChildren()).toEqual(first.root)
  expect(renderer.root.getChildren()[0]).toBe(app.ctx.shell.root)
  expect(viewSlotChild(app.ctx.shell.root)).toBe(first.view!)
  expect(first.view).toBe(app.ctx.unified.island.host)
  expect(app.islands.header.host.parent).toBe(first.header!)
  expect(app.statusBar.host.parent).toBe(first.status!)
  expect(app.fileTreePanel.host.parent).toBe(first.tree!)
  expect(app.islands.header.host.isDestroyed).toBe(false)
})

test("the view slot swaps between the diff and the feed, and the tree hides for the error and the empty diff", async () => {
  app = await mountApp(DIFF, { width: 100, height: 16 })
  const root = app.ctx.shell.root
  app.show({ viewMode: "diff" })
  expect(viewSlotChild(root)).toBe(app.ctx.unified.island.host)
  expect(treeSlot(root).visible).toBe(true)

  app.show({ viewMode: "feed" })
  expect(viewSlotChild(root)).toBe(app.ctx.feed.host)
  expect(app.ctx.unified.island.host.parent).toBeNull()
  expect(app.ctx.unified.island.host.isDestroyed).toBe(false)
  expect(treeSlot(root).visible).toBe(true)

  app.show({ viewMode: "diff" })
  expect(viewSlotChild(root)).toBe(app.ctx.unified.island.host)
  expect(app.ctx.feed.host.isDestroyed).toBe(false)

  app.show({ error: "boom" })
  expect(treeSlot(root).visible).toBe(false)
  const error = viewSlotChild(root)!
  expect(await app.frame()).toContain("Error: boom")
  app.show({ error: "bust" })
  expect(viewSlotChild(root)).toBe(error)
  expect(await app.frame()).toContain("Error: bust")

  app.show({ error: null, files: [] })
  expect(treeSlot(root).visible).toBe(false)
  expect(await app.frame()).toContain("No changes to display")

  // The tree's own toggle is untouched by the slot hiding it.
  expect(app.fileTreePanel.visible).toBe(true)
})
