import { afterEach, expect, test } from "bun:test"
import { adoptReloadedState } from "../features/refresh/handlers"
import { reloadCtx } from "../testing/app-render"
import { jumpScenario, KEY, type JumpScenario } from "../testing/jump-scenarios"

let app: JumpScenario | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

test("a reload empties the jumplist, so Ctrl-o after it leaves the cursor where it is", async () => {
  app = await jumpScenario()
  const a = app
  a.moveTo(a.lineOf("src/alpha.ts", "line 24"))
  a.press(KEY.G)
  await flush()
  expect(a.list().entries).toHaveLength(1)

  adoptReloadedState(reloadCtx(a.mounted), (prev) => prev)
  expect(a.list()).toEqual({ entries: [], index: 0 })

  const reloaded = a.where()
  a.press(KEY.ctrlO)
  await flush()
  expect(a.where()).toEqual(reloaded)
})
