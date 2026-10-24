import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { pinStdoutColumns } from "../testing/frame"
import { PR_NOW } from "../testing/pr-info"
import { fullPr } from "../testing/pr-info-panel"
import { PRInfoPanelClass } from "../components/PRInfoPanel"
import { createReadySends, handleToggleReady, type ReadyStateSources } from "../features/pr-operations/ready-state"

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

async function onDraftPr(isDraft = true) {
  app = await mountApp(DIFF, { width: 120, height: 40 })
  const mounted = app
  const info = { ...fullPr(), isDraft }
  const shown = new PRInfoPanelClass(mounted.setup.renderer, info, mounted.ctx.getState().files, [], new Set(["checks", "description"]))
  panel = shown
  mounted.setPrInfoPanel(shown)
  keysOn(mounted, { getPrInfoPanel: () => shown })
  mounted.show({ appMode: "pr", prInfo: info, viewMode: "state", focusedPanel: "diff" })
  return { mounted, shown }
}

test("the palette offers Mark Ready for Review on a draft PR", async () => {
  const { mounted } = await onDraftPr()
  mounted.actionMenu.show()
  mounted.actionMenu.setQuery("ready")
  mounted.show()
  const frame = await mounted.frame()
  expect(frame).toContain("Mark Ready for Review")
  expect(frame).not.toContain("Convert to Draft")
})

test("the dialog shows owner/repo#N and the command, and once y confirms the header and panel stop saying draft", async () => {
  const { mounted, shown } = await onDraftPr()
  const sent: string[] = []
  const sources: ReadyStateSources = {
    markPullRequestReady: async (owner, repo, n) => {
      sent.push(`ready ${owner}/${repo}#${n}`)
      return { success: true }
    },
    markPullRequestDraft: async () => ({ success: false, error: "not expected" }),
    fetchPrInfo: async () => ({ ...fullPr(), isDraft: false }),
  }
  const before = await mounted.frame()
  expect(before.split("\n")[0]).toStartWith(" Draft #1259")
  expect(before).toMatch(/Blockers\s+draft/)
  handleToggleReady({
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
    sends: createReadySends(),
  })
  const asking = await mounted.frame()
  expect(asking).toContain("Mark Ready for Review")
  expect(asking).toContain("owner/repo#1259")
  expect(asking).toContain("gh pr ready 1259 -R owner/repo")
  expect(sent).toEqual([])

  mounted.setup.mockInput.pressKey("y")
  await Bun.sleep(10)
  const after = await mounted.frame()
  expect(sent).toEqual(["ready owner/repo#1259"])
  expect(after.split("\n")[0]).toStartWith(" Open #1259")
  expect(after).toMatch(/Blockers\s+none/)
  expect(after).toContain("PR marked ready for review")
})

test("two toggles GitHub both refuses leave the header on GitHub's answer, not the newer toggle's revert", async () => {
  const { mounted, shown } = await onDraftPr(false)
  const marks: ((r: { success: false; error: string }) => void)[] = []
  const pending = () => new Promise<{ success: false; error: string }>((r) => { marks.push(r) })
  const sources: ReadyStateSources = {
    markPullRequestReady: pending,
    markPullRequestDraft: pending,
    fetchPrInfo: async () => ({ ...fullPr(), isDraft: false }),
  }
  const ctx = {
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
    sends: createReadySends(),
  }
  expect((await mounted.frame()).split("\n")[0]).toStartWith(" Open #1259")
  handleToggleReady(ctx)
  mounted.confirm.dialog()!.onConfirm()
  handleToggleReady(ctx)
  mounted.confirm.dialog()!.onConfirm()

  marks[1]!({ success: false, error: "second refused" })
  await Bun.sleep(10)
  expect((await mounted.frame()).split("\n")[0]).toStartWith(" Draft #1259")

  marks[0]!({ success: false, error: "first refused" })
  await Bun.sleep(10)
  expect((await mounted.frame()).split("\n")[0]).toStartWith(" Open #1259")
})
