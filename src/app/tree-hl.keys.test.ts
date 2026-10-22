import { afterEach, expect, test } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { treeRowsOf } from "../components"

const fileDiff = (name: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,1 +1,1 @@
-export const old = 1
+export const now = 1
`

const DIFF = ["README.md", "src/a.ts", "src/lib/b.ts", "src/lib/deep/c.ts", "src/lib/z.ts"].map(fileDiff).join("")

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

// Rows as the tree draws them, every directory open:
//   0 src/  1 lib/  2 deep/  3 c.ts  4 b.ts  5 z.ts  6 a.ts  7 README.md
const SRC = 0, LIB = 1, DEEP = 2, C = 3, B = 4, A = 6, README = 7

/** riff's keys through the real createAppKeys with the tree focused on `row`. */
async function treeAt(row: number) {
  await app?.dispose()
  app = await mountApp(DIFF, { width: 120, height: 30 })
  app.show({ focusedPanel: "tree", showFilePanel: true, treeHighlightIndex: row })
  const mounted = app
  keysOn(mounted, { fileTreePanel: mounted.fileTreePanel, updateFileTreePanel: mounted.ctx.updateFileTreePanel })
  mounted.ctx.updateFileTreePanel()
  await mounted.frame()
  const state = () => mounted.ctx.getState()
  const press = (key: string) => mounted.setup.mockInput.pressKey(key)
  const highlighted = () => treeRowsOf(state())[state().treeHighlightIndex]!.node.path
  const expanded = (path: string) => treeRowsOf(state()).find((row) => row.node.path === path)!.node.expanded
  return { mounted, state, press, highlighted, expanded }
}

test("the rows are the ones the tests name", async () => {
  const { state } = await treeAt(0)
  expect(treeRowsOf(state()).map((row) => row.node.path)).toEqual([
    "src", "src/lib", "src/lib/deep", "src/lib/deep/c.ts", "src/lib/b.ts", "src/lib/z.ts", "src/a.ts", "README.md",
  ])
})

test("l on a collapsed directory expands it and keeps the highlight", async () => {
  const { press, highlighted, expanded } = await treeAt(LIB)
  press("h")
  expect(expanded("src/lib")).toBe(false)
  press("l")
  expect(expanded("src/lib")).toBe(true)
  expect(highlighted()).toBe("src/lib")
})

test("l on an expanded directory moves the highlight onto its first child", async () => {
  const { press, highlighted, expanded } = await treeAt(SRC)
  press("l")
  expect(highlighted()).toBe("src/lib")
  press("l")
  expect(highlighted()).toBe("src/lib/deep")
  press("l")
  expect(highlighted()).toBe("src/lib/deep/c.ts")
  expect(expanded("src")).toBe(true)
})

test("l on a file does nothing", async () => {
  const { press, highlighted, state } = await treeAt(B)
  press("l")
  expect(highlighted()).toBe("src/lib/b.ts")
  expect(state().focusedPanel).toBe("tree")
})

test("h on an expanded directory collapses it and keeps the highlight", async () => {
  const { press, highlighted, expanded } = await treeAt(DEEP)
  press("h")
  expect(expanded("src/lib/deep")).toBe(false)
  expect(highlighted()).toBe("src/lib/deep")
})

test("h on a file inside a directory climbs to it and leaves it open", async () => {
  const { press, highlighted, expanded } = await treeAt(C)
  press("h")
  expect(highlighted()).toBe("src/lib/deep")
  expect(expanded("src/lib/deep")).toBe(true)

  const second = await treeAt(A)
  second.press("h")
  expect(second.highlighted()).toBe("src")
  expect(second.expanded("src")).toBe(true)
})

test("h on a collapsed nested directory climbs to its parent and leaves it open", async () => {
  const { press, highlighted, expanded } = await treeAt(DEEP)
  press("h")
  press("h")
  expect(highlighted()).toBe("src/lib")
  expect(expanded("src/lib")).toBe(true)
  expect(expanded("src/lib/deep")).toBe(false)
})

test("h at depth 0 does nothing, on a file or on a collapsed directory", async () => {
  const file = await treeAt(README)
  file.press("h")
  expect(file.highlighted()).toBe("README.md")
  expect(file.expanded("src")).toBe(true)

  const dir = await treeAt(SRC)
  dir.press("h")
  dir.press("h")
  expect(dir.highlighted()).toBe("src")
  expect(dir.expanded("src")).toBe(false)
})
