import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test"
import { PRInfoPanelClass } from "../components/PRInfoPanel"
import type { PrCheck, PrInfo } from "../providers/github/types"
import type { Comment } from "../types"
import { mountApp } from "../testing/app-render"
import { ago, PR_NOW, prInfo } from "../testing/pr-info"
import { pressFold } from "../testing/pr-info-panel"
import { columnWidthsOf } from "./column-widths"

// The PR info panel is drawn in the diff column, beside the tree, so its
// rows are cut to that column rather than to the screen (spec 108).

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

const build: PrCheck = {
  id: 1,
  name: "build",
  status: "completed",
  conclusion: "success",
  detailsUrl: null,
  startedAt: null,
  completedAt: null,
  isRequired: true,
}

const info: PrInfo = prInfo("Adds the skill.", {
  baseRef: "main",
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  reviewDecision: "APPROVED",
  reviews: [],
  requestedReviewers: [],
  checks: [build],
})

const thread: Comment = {
  id: "gh-1",
  filename: "src/greet.ts",
  line: 12,
  side: "RIGHT",
  body: "Rename this to greeting, it is what every caller of it already calls it in the docs, the tests and the changelog",
  createdAt: ago(30),
  status: "synced",
  author: "alice",
  isThreadResolved: false,
}

let app: Awaited<ReturnType<typeof mountApp>> | null = null
let panel: PRInfoPanelClass | null = null
beforeEach(() => setSystemTime(PR_NOW))
afterEach(async () => {
  panel?.destroy()
  panel = null
  await app?.dispose()
  app = null
  setSystemTime()
})

test("a thread under the merge status keeps its place and author whole beside the tree, and only its preview is cut", async () => {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  const mounted = app
  mounted.show({ appMode: "pr", prInfo: info, viewMode: "state", focusedPanel: "diff", showFilePanel: true })
  const width = () => columnWidthsOf({ ...mounted.ctx.getState(), chatOpen: mounted.chatColumnState.open() }, 120).diff
  const shown = new PRInfoPanelClass(mounted.setup.renderer, info, mounted.ctx.getState().files, [thread], new Set(["checks"]), width)
  panel = shown
  mounted.setPrInfoPanel(shown)
  shown.setBehindBy(0)
  shown.setActiveSection("checks")
  shown.moveCursor(4)
  pressFold(shown, "l")

  const lines = (await mounted.frame()).split("\n")
  const row = lines.find((line) => line.includes("greet.ts:12"))!
  expect(row).toContain("⚠ greet.ts:12  @alice  Rename this")
  expect(row.trimEnd()).toEndWith("…")
  expect(lines.some((line) => line.trim() === "▼  Merge status  ⚠ mergeable with warnings")).toBe(true)

  // The panel takes the tree's columns back on the next frame.
  mounted.show({ showFilePanel: false })
  const wide = (await mounted.frame()).split("\n").find((line) => line.includes("greet.ts:12"))!
  expect(wide.trim().length).toBeGreaterThan(row.trim().length + 30)
  expect(wide.trimEnd()).toEndWith("…")
})
