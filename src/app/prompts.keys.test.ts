import { afterEach, expect, test } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { SearchHandler } from "../vim-diff/search-handler"
import { setTreeFilter } from "../state"

const fileDiff = (name: string, body: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,3 +1,3 @@
 export function ${body}() {
-  return "hi"
+  return "hello"
 }
`

const DIFF = fileDiff("src/greet.ts", "greet")
const TWO_FILES = `${DIFF}${fileDiff("lib/wave.ts", "wave")}`

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/** riff's keys with a real search handler, whose pattern the search line types. */
async function searchApp() {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  const mounted = app
  const { ctx: render } = mounted
  const searchHandler = new SearchHandler({
    getMapping: render.getLineMapping,
    getSearchState: render.getSearchState,
    setSearchState: mounted.setSearchState,
    getCursor: render.getVimState,
    setCursor: () => {},
    getFileContent: () => null,
    loadFileContent: async () => {},
    expandDividerForLine: () => {},
    getCollapsedFiles: () => [],
    expandFiles: () => {},
    onUpdate: mounted.render,
  })
  mounted.onSearchPattern((value) => searchHandler.updatePattern(value))
  const keys = keysOn(mounted, { getSearchState: render.getSearchState, searchHandler })
  await mounted.frame()
  return { mounted, ...keys }
}

/** riff on two files with the tree shown and focused, its keys reaching the tree. */
async function treeApp() {
  app = await mountApp(TWO_FILES, { width: 120, height: 30 })
  const mounted = app
  mounted.show({ showFilePanel: true, focusedPanel: "tree" })
  const keys = keysOn(mounted, {
    fileTreePanel: mounted.fileTreePanel,
    updateFileTreePanel: mounted.ctx.updateFileTreePanel,
  })
  // As app.ts wires it: the field owns its text, and state mirrors it.
  mounted.fileTreePanel.setOnFilterChange((value) => {
    mounted.ctx.setState((s) => setTreeFilter(s, value))
    mounted.ctx.updateFileTreePanel()
    mounted.render()
  })
  mounted.ctx.updateFileTreePanel()
  await mounted.frame()
  return { mounted, ...keys }
}

const searchLine = async () =>
  (await app!.frame()).split("\n").find((line) => line.trimStart().startsWith("/"))?.trim()

test("/ in the diff types a pattern, and Esc drops the prompt and the pattern with it", async () => {
  const { mounted } = await searchApp()
  await mounted.setup.mockInput.typeText("/hel")
  expect(mounted.ctx.getSearchState().active).toBe(true)
  expect(mounted.ctx.getSearchState().pattern).toBe("hel")
  expect(await searchLine()).toBe("/hel")

  mounted.setup.mockInput.pressEscape()
  await Bun.sleep(50)
  expect(mounted.ctx.getSearchState().active).toBe(false)
  expect(mounted.ctx.getSearchState().pattern).toBe("")
  expect(await searchLine()).toBeUndefined()
})

test("q typed into the search prompt is a letter of the pattern, not quit", async () => {
  const { mounted, quits } = await searchApp()
  await mounted.setup.mockInput.typeText("/q")
  expect(quits).toEqual([])
  expect(mounted.ctx.getSearchState().pattern).toBe("q")
  expect(await searchLine()).toBe("/q")
})

test("/ in the tree types a path, and Enter keeps the filter", async () => {
  const { mounted } = await treeApp()
  expect(await mounted.frame()).toContain("greet.ts")

  await mounted.setup.mockInput.typeText("/wave")
  expect(mounted.ctx.getState().treeFilterInput).toBe(true)
  expect(mounted.ctx.getState().treeFilter).toBe("wave")

  mounted.setup.mockInput.pressEnter()
  await flush()
  expect(mounted.ctx.getState().treeFilterInput).toBe(false)
  expect(mounted.ctx.getState().treeFilter).toBe("wave")
  const tree = (await mounted.frame()).split("\n").map((line) => line.slice(0, 35)).join("\n")
  expect(tree).toContain("wave.ts")
  expect(tree).not.toContain("greet.ts")
})

test("q and i typed into the tree's filter are letters of the path, not quit or the PR view", async () => {
  const { mounted, quits } = await treeApp()
  await mounted.setup.mockInput.typeText("/qi")
  expect(quits).toEqual([])
  expect(mounted.ctx.getState().viewMode).toBe("diff")
  expect(mounted.ctx.getState().treeFilter).toBe("qi")
})
