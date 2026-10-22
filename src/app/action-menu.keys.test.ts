import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { bgAt, ints } from "../testing/frame"
import { theme } from "../theme"
import { paletteMode } from "../features/action-menu/palette-mode"
import { getVisualActionOrder } from "../components/action-menu-model"

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
`

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

test("bare p and n are typed into the palette's field rather than moving its selection", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  keysOn(app)
  const { mockInput } = app.setup

  mockInput.pressKey("p", { ctrl: true })
  expect(app.actionMenu.open()).toBe(true)
  await mockInput.typeText("pn")

  expect(app.actionMenu.query()).toBe("pn")
  expect(app.actionMenu.selectedIndex()).toBe(0)
  const lines = (await app.frame()).split("\n")
  const field = lines.findIndex((line) => line.includes("Commands")) + 2
  expect(lines[field]).toContain("pn")
})

test("ctrl+n moves the shaded row down the palette", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  const keys = keysOn(app)
  const { mockInput } = app.setup
  mockInput.pressKey("p", { ctrl: true })
  const mode = paletteMode(app.ctx.getState(), keys.vimState(), app.actionMenu.snapshot())
  const [first, second] = mode.kind === "actions" ? getVisualActionOrder(mode.actions) : []
  const rowOf = (lines: string[], label: string) => lines.findIndex((line) => line.includes(label))

  const before = (await app.frame()).split("\n")
  const spansBefore = app.setup.captureSpans()
  expect(bgAt(spansBefore, 27, rowOf(before, first!.label))).toEqual(ints(theme.surface0))
  expect(bgAt(spansBefore, 27, rowOf(before, second!.label))).not.toEqual(ints(theme.surface0))

  mockInput.pressKey("n", { ctrl: true })

  const after = (await app.frame()).split("\n")
  const spansAfter = app.setup.captureSpans()
  expect(app.actionMenu.selectedIndex()).toBe(1)
  expect(bgAt(spansAfter, 27, rowOf(after, first!.label))).not.toEqual(ints(theme.surface0))
  expect(bgAt(spansAfter, 27, rowOf(after, second!.label))).toEqual(ints(theme.surface0))
  expect(app.actionMenu.query()).toBe("")
})

test("escape closes the palette and the next j moves the diff's cursor", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  const keys = keysOn(app)
  const { mockInput } = app.setup
  mockInput.pressKey("p", { ctrl: true })
  expect(await app.frame()).toContain("Commands")
  const line = keys.vimState().line

  mockInput.pressEscape()
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  await Bun.sleep(50)
  expect(app.actionMenu.open()).toBe(false)
  expect(await app.frame()).not.toContain("Commands")

  mockInput.pressKey("j")
  expect(keys.vimState().line).toBe(line + 1)
})

test("the palette shows each action's key from the keymap command that runs it", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  keysOn(app)
  const { mockInput } = app.setup
  const rowWith = (frame: string, label: string) => frame.split("\n").find((line) => line.includes(label)) ?? ""

  mockInput.pressKey("p", { ctrl: true })
  await mockInput.typeText("next file")
  expect(rowWith(await app.frame(), "Next File")).toMatch(/Next File\s+\]f/)

  mockInput.pressKey("u", { ctrl: true })
  await mockInput.typeText("line wrap")
  expect(app.actionMenu.query()).toBe("line wrap")
  expect(rowWith(await app.frame(), "Toggle Line Wrap")).toMatch(/Toggle Line Wrap\s+zw/)
})

/** The palette's rows in the order they are drawn, for what it holds now. */
function paletteRows(mounted: NonNullable<typeof app>, keys: ReturnType<typeof keysOn>) {
  const mode = paletteMode(mounted.ctx.getState(), keys.vimState(), mounted.actionMenu.snapshot())
  return mode.kind === "actions" ? getVisualActionOrder(mode.actions).map((action) => action.label) : []
}

/** Whether the row drawing `label` wears the selection's shade. */
async function shaded(mounted: NonNullable<typeof app>, label: string) {
  const lines = (await mounted.frame()).split("\n")
  const y = lines.findIndex((line) => line.includes(label))
  expect(y).toBeGreaterThan(-1)
  return String(bgAt(mounted.setup.captureSpans(), 27, y)) === String(ints(theme.surface0))
}

test("a query narrows the palette with the shade on its first match, typing moves the shade back there, and Ctrl-p after Esc opens on the full list", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  const keys = keysOn(app)
  const { mockInput } = app.setup

  mockInput.pressKey("p", { ctrl: true })
  await app.frame()
  const full = paletteRows(app, keys)

  await mockInput.typeText("toggl")
  const narrowed = paletteRows(app, keys)
  expect(narrowed.length).toBeGreaterThan(1)
  expect(narrowed.length).toBeLessThan(full.length)
  const [first, second] = narrowed
  const dropped = full.find((label) => !narrowed.includes(label))!
  expect(await shaded(app, first!)).toBe(true)
  expect(await shaded(app, second!)).toBe(false)
  expect(await app.frame()).not.toContain(dropped)

  mockInput.pressKey("n", { ctrl: true })
  expect(await shaded(app, second!)).toBe(true)
  await mockInput.typeText("e")
  const [firstMatch, secondMatch] = paletteRows(app, keys)
  expect(await shaded(app, firstMatch!)).toBe(true)
  expect(await shaded(app, secondMatch!)).toBe(false)

  mockInput.pressEscape()
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  await Bun.sleep(50)
  expect(await app.frame()).not.toContain("Commands")
  mockInput.pressKey("p", { ctrl: true })
  const lines = (await app.frame()).split("\n")
  const field = lines.findIndex((line) => line.includes("Commands")) + 2
  expect(lines[field]).not.toContain("toggle")
  expect(paletteRows(app, keys)).toEqual(full)
  expect(await app.frame()).toContain(dropped)
  expect(await shaded(app, full[0]!)).toBe(true)
})
