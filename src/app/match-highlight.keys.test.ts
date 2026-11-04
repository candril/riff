import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { bgAt, fgAt, ints } from "../testing/frame"
import { colors, theme } from "../theme"

const fileDiff = (name: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,1 +1,1 @@
-old
+new
`
const READ = "src/domain/FamilyReadModel.cs"
const WRITE = "src/domain/FamilyWriteModel.cs"
const DIFF = fileDiff(READ) + fileDiff(WRITE) + fileDiff("src/greet.ts")

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** The row and column `text` starts at below the line holding `title`: the picker's, not the tree's or the header's. */
function cellOf(lines: string[], title: string, text: string): { x: number; y: number } {
  const top = lines.findIndex((line) => line.includes(title))
  const y = lines.findIndex((line, i) => i > top && line.includes(text))
  return { x: lines[y]!.indexOf(text), y }
}

const MATCH_BG = ints(colors.filterMatchBg)

test("Ctrl-f then frm picks out F, R and M of FamilyReadModel, on the selected row and the others", async () => {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  app.show()
  keysOn(app)
  const { mockInput } = app.setup

  mockInput.pressKey("f", { ctrl: true })
  await mockInput.typeText("frm")
  const lines = (await app.frame()).split("\n")
  const spans = app.setup.captureSpans()

  expect(app.filePicker.snapshot().query).toBe("frm")
  const rows = [cellOf(lines, "Find Files", READ), cellOf(lines, "Find Files", WRITE)]
  // Both match frm, so one of them is the selected row and the other is not.
  for (const { y } of rows) expect(y).toBeGreaterThan(lines.findIndex((line) => line.includes("Find Files")))
  expect(lines.join("\n")).toMatch(/Find Files\s+1\/2/)

  const read = rows[0]!
  // "src/domain/" is 11 cells: F at 11, R at 17, M at 21.
  for (const at of [11, 17, 21]) {
    expect(bgAt(spans, read.x + at, read.y)).toEqual(MATCH_BG)
    expect(fgAt(spans, read.x + at, read.y)).toEqual(ints(colors.filterMatchFg))
  }
  for (const at of [10, 12, 16, 18, 20, 22]) expect(bgAt(spans, read.x + at, read.y)).not.toEqual(MATCH_BG)

  // FamilyWriteModel: F at 11, the r of Write at 18, M at 22.
  const write = rows[1]!
  for (const at of [11, 18, 22]) expect(bgAt(spans, write.x + at, write.y)).toEqual(MATCH_BG)
  for (const at of [12, 17, 19, 21, 23]) expect(bgAt(spans, write.x + at, write.y)).not.toEqual(MATCH_BG)

  // The selected row keeps its shade around the picked-out cells; the other row has none.
  const shaded = rows.filter(({ x, y }) => JSON.stringify(bgAt(spans, x + 12, y)) === JSON.stringify(ints(theme.surface0)))
  expect(shaded.length).toBe(1)
})

test("Ctrl-p then tfp picks out T, F and P of Toggle File Panel's label", async () => {
  app = await mountApp(DIFF, { width: 120, height: 40 })
  app.show()
  keysOn(app)
  const { mockInput } = app.setup

  mockInput.pressKey("p", { ctrl: true })
  await mockInput.typeText("tfp")
  const lines = (await app.frame()).split("\n")
  const spans = app.setup.captureSpans()

  const label = cellOf(lines, "Commands", "Toggle File Panel")
  expect(label.y).toBeGreaterThan(0)
  for (const at of [0, 7, 12]) {
    expect(bgAt(spans, label.x + at, label.y)).toEqual(MATCH_BG)
    expect(fgAt(spans, label.x + at, label.y)).toEqual(ints(colors.filterMatchFg))
  }
  for (const at of [1, 6, 8, 11, 13]) expect(bgAt(spans, label.x + at, label.y)).not.toEqual(MATCH_BG)
})

test("Ctrl-p then pr picks out P and R of Create Pull Request, which ranked on its id create-pr", async () => {
  app = await mountApp(DIFF, { width: 120, height: 40 })
  app.show()
  keysOn(app)
  const { mockInput } = app.setup

  mockInput.pressKey("p", { ctrl: true })
  await mockInput.typeText("pr")
  const lines = (await app.frame()).split("\n")
  const spans = app.setup.captureSpans()

  const label = cellOf(lines, "Commands", "Create Pull Request")
  expect(label.y).toBeGreaterThan(0)
  // "Create " is 7 cells: P at 7, R at 12.
  for (const at of [7, 12]) {
    expect(bgAt(spans, label.x + at, label.y)).toEqual(MATCH_BG)
    expect(fgAt(spans, label.x + at, label.y)).toEqual(ints(colors.filterMatchFg))
  }
  for (const at of [0, 1, 6, 8, 11, 13, 18]) expect(bgAt(spans, label.x + at, label.y)).not.toEqual(MATCH_BG)
})
