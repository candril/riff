import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { PR_NOW } from "../testing/pr-info"
import { fullPr } from "../testing/pr-info-panel"
import { PRInfoPanelClass } from "../components/PRInfoPanel"
import { mergeCommand } from "../providers/github/mutations"
import { handleMerge, type MergeSources } from "../features/pr-operations/merge"

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
beforeEach(() => {
  setSystemTime(PR_NOW)
})
afterEach(async () => {
  panel?.destroy()
  panel = null
  await app?.dispose()
  app = null
  setSystemTime()
})

async function onMergeablePr() {
  app = await mountApp(DIFF, { width: 120, height: 40 })
  const mounted = app
  const info = {
    ...fullPr(),
    isDraft: false,
    mergeStateStatus: "CLEAN" as const,
    mergeMethods: ["squash" as const, "rebase" as const],
    deleteBranchOnMerge: false,
  }
  const shown = new PRInfoPanelClass(mounted.setup.renderer, info, mounted.ctx.getState().files, [], new Set(["checks", "description"]))
  panel = shown
  mounted.setPrInfoPanel(shown)
  keysOn(mounted, { getPrInfoPanel: () => shown })
  mounted.show({ appMode: "pr", prInfo: info, viewMode: "state", focusedPanel: "diff" })
  return { mounted, shown }
}

test("d answers a dialog only when it offers a second answer", async () => {
  const { mounted } = await onMergeablePr()
  const answered: string[] = []
  mounted.confirm.show({ title: "Plain", message: "m", onConfirm: () => answered.push("y"), onCancel: () => answered.push("n") })
  mounted.render()
  mounted.setup.mockInput.pressKey("d")
  await Bun.sleep(10)
  expect(answered).toEqual([])
  expect(mounted.confirm.dialog()).not.toBeNull()

  mounted.confirm.show({
    title: "Two ways",
    message: "m",
    onConfirm: () => answered.push("y"),
    onCancel: () => answered.push("n"),
    alternative: { key: "d", label: "other", onConfirm: () => answered.push("d") },
  })
  mounted.render()
  mounted.setup.mockInput.pressKey("d")
  await Bun.sleep(10)
  expect(answered).toEqual(["d"])
})

test("the palette offers a merge per allowed method", async () => {
  const { mounted } = await onMergeablePr()
  mounted.actionMenu.show()
  mounted.actionMenu.setQuery("merge")
  mounted.show()
  const frame = await mounted.frame()
  expect(frame).toContain("Squash and Merge")
  expect(frame).toContain("Rebase and Merge")
  expect(frame).not.toContain("Create a Merge Commit")
})

test("the dialog shows both commands, and d merges and deletes the branch, and the header follows", async () => {
  const { mounted, shown } = await onMergeablePr()
  const sent: string[] = []
  const sources: MergeSources = {
    mergePullRequest: async (owner, repo, n, options) => {
      sent.push(mergeCommand(owner, repo, n, options).join(" "))
      return { success: true }
    },
    fetchPrInfo: async () => ({ ...fullPr(), state: "merged" }),
  }
  handleMerge(
    {
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
    },
    "squash"
  )
  const asking = await mounted.frame()
  expect(asking).toContain("Squash and Merge")
  expect(asking).toContain("owner/repo#1259 into")
  expect(asking).toContain("gh pr merge 1259 -R owner/repo --squash --delete-branch")
  expect(asking).toContain("d merge and delete the branch")
  expect(sent).toEqual([])

  mounted.setup.mockInput.pressKey("d")
  await Bun.sleep(10)
  const after = await mounted.frame()
  expect(sent).toEqual(["gh pr merge 1259 -R owner/repo --squash --delete-branch"])
  expect(after.split("\n")[0]).toStartWith(" Merged #1259")
  expect(after).toContain("PR merged, branch deleted")
})
