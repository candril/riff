import { afterEach, expect, test } from "bun:test"
import { adoptReloadedState } from "../features/refresh/handlers"
import { createInitialState } from "../state"
import { reloadCtx } from "../testing/app-render"
import { jumpScenario, type JumpScenario } from "../testing/jump-scenarios"

let app: JumpScenario | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

test("a reload keeps the marks and the two last visited: their signs are drawn, '' flips to the one before, and 'a and 'b still jump", async () => {
  app = await jumpScenario()
  const a = app
  const marked = a.lineOf("src/alpha.ts", "line 24")
  const other = a.lineOf("src/alpha.ts", "line 22")
  a.moveTo(marked)
  a.press("m", "a")
  a.moveTo(other)
  a.press("m", "b")
  a.press("'", "a")
  a.press("'", "b")

  adoptReloadedState(reloadCtx(a.mounted), (prev) => createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"))
  a.mounted.render()

  const rows = (await a.mounted.frame()).split("\n")
  expect(rows.find((row) => row.includes('"src/alpha.ts line 24"'))).toMatch(/ a 24 /)
  expect(rows.find((row) => row.includes('"src/alpha.ts line 22"'))).toMatch(/ b 22 /)

  // b was current and a the one before it, so '' goes back to a.
  a.moveTo(0)
  a.press("'", "'")
  expect(a.where().line).toBe(marked)
  a.moveTo(0)
  a.press("'", "b")
  expect(a.where().line).toBe(other)
  a.moveTo(0)
  a.press("'", "a")
  expect(a.where().line).toBe(marked)
})
