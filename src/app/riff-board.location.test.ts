import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { prInfo } from "../testing/pr-info"
import { createCursorState } from "../vim-diff/cursor-state"
import { treeRowsOf } from "../components"
import { diffTargetAt, type PermalinkContext } from "../features/permalink"
import { boardLocation, openPrInBoard } from "../features/riff-board"

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

const PR = prInfo("", { number: 42 })
const BASE = "http://localhost:4477/pr/owner/repo/42"

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  // Let the renders show queued land before dispose tears the scene down under them.
  await app?.frame()
  await app?.dispose()
  app = null
})

async function mounted() {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show({ appMode: "pr", prInfo: PR, viewMode: "diff", focusedPanel: "diff" })
  return app
}

/**
 * What gB opens, worked out the way app.ts does it: the permalink resolver
 * over the app's own mapping and comment scope, so scopeAnchors decides the
 * line.
 */
function openedUrl(mounted: NonNullable<typeof app>, vimState = createCursorState()): string[] {
  mounted.setVimState(vimState)
  const { ctx } = mounted
  const permalinkContext: PermalinkContext = {
    getState: ctx.getState,
    setState: ctx.setState,
    getVimState: () => vimState,
    getLineMapping: ctx.getLineMapping,
    getCommentScope: () => ctx.split.commentScope(),
    render: () => {},
    toast: mounted.toast,
    mode: "pr",
    prInfo: PR,
    getHeadSha: () => "",
  }
  const urls: string[] = []
  openPrInBoard({
    getState: ctx.getState,
    setState: ctx.setState,
    render: () => {},
    toast: mounted.toast,
    openUrl: (url) => { urls.push(url); return true },
    boardUrl: "http://localhost:4477",
    location: () => boardLocation(ctx.getState(), diffTargetAt(permalinkContext)),
  })
  return urls
}

function cursorOn(mounted: NonNullable<typeof app>, rawLine: string) {
  const line = mounted.ctx.getLineMapping().allLines.findIndex((l) => l.rawLine === rawLine)
  expect(line).toBeGreaterThanOrEqual(0)
  return { ...createCursorState(), line }
}

test("gB on an added line opens the board at its new-side line", async () => {
  const app = await mounted()
  expect(openedUrl(app, cursorOn(app, '+  return "hello"'))).toEqual([`${BASE}?file=src%2Fgreet.ts&line=2`])
})

test("gB on a removed line opens the board at its old-side line", async () => {
  const app = await mounted()
  expect(openedUrl(app, cursorOn(app, '-  return "hi"'))).toEqual([`${BASE}?file=src%2Fgreet.ts&line=2&side=old`])
})

test("gB on a file in the tree opens the board at the file only", async () => {
  const app = await mounted()
  const s = app.ctx.getState()
  const index = treeRowsOf(s).findIndex(
    (item) => item.node.path === "src/greet.ts",
  )
  expect(index).toBeGreaterThanOrEqual(0)
  app.show({ focusedPanel: "tree", treeHighlightIndex: index })
  expect(openedUrl(app)).toEqual([`${BASE}?file=src%2Fgreet.ts`])
})

test("gB from the overview or the feed opens the bare PR path", async () => {
  const app = await mounted()
  const onAdded = cursorOn(app, '+  return "hello"')
  app.show({ viewMode: "state" })
  expect(openedUrl(app, onAdded)).toEqual([BASE])
  app.show({ viewMode: "feed" })
  expect(openedUrl(app, onAdded)).toEqual([BASE])
})

test("gB on a selection opens the board at its first line", async () => {
  const app = await mounted()
  const start = cursorOn(app, " export function greet() {").line
  const end = cursorOn(app, '+  return "hello"').line
  const selection = { ...createCursorState(), mode: "visual-line" as const, selectionAnchor: start, line: end }
  expect(openedUrl(app, selection)).toEqual([`${BASE}?file=src%2Fgreet.ts&line=1`])
})

test("gB on the file header, which has no line, opens the board at the file", async () => {
  const app = await mounted()
  const header = app.ctx.getLineMapping().allLines.findIndex((l) => l.type === "file-header")
  expect(openedUrl(app, { ...createCursorState(), line: header })).toEqual([`${BASE}?file=src%2Fgreet.ts`])
})
