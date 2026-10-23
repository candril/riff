import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { pinStdoutColumns } from "../testing/frame"
import { PR_NOW } from "../testing/pr-info"
import { fullPr } from "../testing/pr-info-panel"
import { PRInfoPanelClass } from "../components/PRInfoPanel"
import type { BehindBy } from "../components/merge-status-model"
import type { UpdateMethod } from "../providers/github/mutations"
import { handleUpdateBranch, type UpdateBranchSources } from "../features/pr-operations/update-branch"

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
let panel: PRInfoPanelClass | null = null
let restoreColumns: (() => void) | null = null
beforeEach(() => {
  setSystemTime(PR_NOW)
  restoreColumns = pinStdoutColumns(120)
})
afterEach(async () => {
  panel?.destroy()
  panel = null
  await app?.dispose()
  app = null
  restoreColumns?.()
  setSystemTime()
})

async function onBehindPr() {
  app = await mountApp(DIFF, { width: 120, height: 40 })
  const mounted = app
  const info = { ...fullPr(), isDraft: false, mergeStateStatus: "BEHIND" as const }
  const shown = new PRInfoPanelClass(mounted.setup.renderer, info, mounted.ctx.getState().files, [], new Set(["checks", "description"]))
  panel = shown
  mounted.setPrInfoPanel(shown)
  keysOn(mounted, { getPrInfoPanel: () => shown })
  mounted.show({ appMode: "pr", prInfo: info, viewMode: "state", focusedPanel: "diff" })
  return { mounted, shown }
}

test("the palette offers Update Branch on an open PR", async () => {
  const { mounted } = await onBehindPr()
  mounted.actionMenu.show()
  mounted.actionMenu.setQuery("update branch")
  mounted.show()
  expect(await mounted.frame()).toContain("Update Branch")
})

test("the dialog shows both commands, and r rebases the branch onto its base", async () => {
  const { mounted, shown } = await onBehindPr()
  const methods: UpdateMethod[] = []
  const settled: BehindBy[] = []
  const sources: UpdateBranchSources = {
    updatePullRequestBranch: async (_owner, _repo, _n, method) => {
      methods.push(method)
      return { success: true }
    },
    fetchPrInfo: async () => ({ ...fullPr(), mergeStateStatus: "CLEAN" }),
  }
  handleUpdateBranch({
    sources,
    getState: mounted.ctx.getState,
    setState: mounted.ctx.setState,
    confirm: mounted.confirm,
    toast: mounted.toast,
    render: () => {
      const info = mounted.ctx.getState().prInfo
      if (info) shown.setPrInfo(info)
      mounted.render()
    },
    later: () => {},
    behindBy: () => 4,
    settleBehindBy: (next) => {
      settled.push(next)
      shown.setBehindBy(next)
    },
  })
  const asking = await mounted.frame()
  expect(asking).toContain("Update Branch")
  expect(asking).toContain("owner/repo#1259 from master")
  expect(asking).toContain("merges master into a-branch, 4")
  expect(asking).toContain("gh pr update-branch 1259 -R owner/repo")
  expect(asking).toContain("gh pr update-branch 1259 -R owner/repo --rebase")
  expect(asking).toContain("r rebase onto master instead")
  expect(methods).toEqual([])

  mounted.setup.mockInput.pressKey("r")
  await Bun.sleep(10)
  const after = await mounted.frame()
  expect(methods).toEqual(["rebase"])
  expect(settled).toEqual([0])
  expect(after).toContain("Branch rebased onto master")
  expect(after).not.toContain("gh pr update-branch")
  expect(after).toMatch(/✓ Base\s+up to date/)
})
