import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { PR_NOW } from "../testing/pr-info"
import { fullPr } from "../testing/pr-info-panel"
import { PRInfoPanelClass } from "../components/PRInfoPanel"
import type { PrInfo } from "../providers/github/types"
import type { ReadyResult } from "../providers/github/mutations"
import { executeAction, type ActionHandlers } from "../features/action-menu/execute"
import { createFeedState } from "../features/feed/state"
import {
  handleDequeue,
  handleDisableAutoMerge,
  handleEnableAutoMerge,
  handleEnqueue,
  type AutoMergeContext,
  type AutoMergeSources,
} from "../features/pr-operations/auto-merge"

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

/**
 * The app with the palette's Enter running execute.ts for real, and only the
 * auto-merge handlers behind it; every gh call lands in `sent`.
 */
async function onPr(extra: Partial<PrInfo>) {
  app = await mountApp(DIFF, { width: 120, height: 40 })
  const mounted = app
  const info: PrInfo = {
    ...fullPr(),
    isDraft: false,
    mergeStateStatus: "BLOCKED",
    mergeMethods: ["squash", "merge", "rebase"],
    autoMergeAllowed: true,
    autoMergeMethod: null,
    mergeQueue: null,
    nodeId: "PR_kwDO",
    ...extra,
  }
  const shown = new PRInfoPanelClass(mounted.setup.renderer, info, mounted.ctx.getState().files, [], new Set(["checks", "description"]))
  panel = shown
  mounted.setPrInfoPanel(shown)

  const sent: unknown[][] = []
  const record = (name: string) => async (...args: unknown[]): Promise<ReadyResult> => {
    sent.push([name, ...args])
    return { success: true }
  }
  const sources: AutoMergeSources = {
    enableAutoMerge: record("enableAutoMerge"),
    disableAutoMerge: record("disableAutoMerge"),
    enqueuePullRequest: record("enqueuePullRequest"),
    dequeuePullRequest: record("dequeuePullRequest"),
    fetchPrInfo: () => Promise.reject(new Error("no gh in a test")),
  }
  const autoMerge: AutoMergeContext = {
    sources,
    getState: mounted.ctx.getState,
    setState: mounted.ctx.setState,
    confirm: mounted.confirm,
    toast: mounted.toast,
    render: () => {
      const current = mounted.ctx.getState().prInfo
      if (current) shown.setPrInfo(current)
      mounted.render()
    },
    later: () => {},
  }
  const wired: Partial<ActionHandlers> = {
    handleEnableAutoMerge: (method) => handleEnableAutoMerge(autoMerge, method),
    handleDisableAutoMerge: () => handleDisableAutoMerge(autoMerge),
    handleEnqueue: () => handleEnqueue(autoMerge),
    handleDequeue: () => handleDequeue(autoMerge),
  }
  const handlers = new Proxy(wired as ActionHandlers, {
    get: (target, name) => target[name as keyof ActionHandlers] ?? (() => { throw new Error(`unwired handler ${String(name)}`) }),
  })

  keysOn(mounted, {
    getPrInfoPanel: () => shown,
    executeAction: (id) =>
      void executeAction(id, {
        get state() {
          return mounted.ctx.getState()
        },
        setState: mounted.ctx.setState,
        render: mounted.render,
        toast: mounted.toast,
        filePicker: mounted.filePicker,
        commentsPicker: mounted.commentsPicker,
        occurrencePicker: mounted.occurrencePicker,
        marksPicker: mounted.marksPicker,
        commitPicker: mounted.commitPicker,
        actionMenu: mounted.actionMenu,
        linePeek: mounted.linePeek,
        feed: createFeedState(),
        prInfoFilter: mounted.prInfoFilter,
        diffOptions: mounted.diffOptions,
        handlers,
        commandKeys: new Map(),
        runCommand: () => false,
        reactionTarget: () => null,
      }),
  })
  mounted.show({ appMode: "pr", prInfo: info, viewMode: "state", focusedPanel: "diff" })
  return { mounted, sent }
}

async function pick(mounted: Awaited<ReturnType<typeof onPr>>["mounted"], query: string, label: string) {
  mounted.actionMenu.show()
  mounted.actionMenu.setQuery(query)
  mounted.show()
  expect(await mounted.frame()).toContain(label)
  mounted.setup.mockInput.pressEnter()
  await Bun.sleep(10)
  return mounted.frame()
}

test("Enable Auto-Merge (Squash) asks with the exact command, and y arms it and the merge status says so", async () => {
  const { mounted, sent } = await onPr({})
  const asking = await pick(mounted, "enable auto-merge squash", "Enable Auto-Merge (Squash)")
  expect(asking).toContain("Enable Auto-Merge")
  expect(asking).toContain("owner/repo#1259")
  expect(asking).toContain("gh pr merge 1259 -R owner/repo --auto --squash")
  expect(sent).toEqual([])

  mounted.setup.mockInput.pressKey("y")
  await Bun.sleep(10)
  const after = await mounted.frame()
  expect(sent).toEqual([["enableAutoMerge", "owner", "repo", 1259, "squash"]])
  expect(after).toContain("auto-merge armed (squash)")
  expect(after).not.toContain("gh pr merge 1259")
})

test("Add to Merge Queue asks, and y queues the PR", async () => {
  const { mounted, sent } = await onPr({ mergeQueue: { entry: null, inQueue: false, removal: null } })
  const asking = await pick(mounted, "add to merge queue", "Add to Merge Queue")
  expect(asking).toContain("gh pr merge 1259 -R owner/repo")
  mounted.setup.mockInput.pressKey("y")
  await Bun.sleep(10)
  expect(sent).toEqual([["enqueuePullRequest", "owner", "repo", 1259]])
  expect(await mounted.frame()).toContain("Added to the merge queue")
})

test("a stray key leaves the question up, n cancels it, and nothing is sent either way", async () => {
  const { mounted, sent } = await onPr({})
  await pick(mounted, "enable auto-merge squash", "Enable Auto-Merge (Squash)")
  for (const stray of ["x", "d", "r"]) mounted.setup.mockInput.pressKey(stray)
  await Bun.sleep(10)
  expect(await mounted.frame()).toContain("gh pr merge 1259 -R owner/repo --auto --squash")
  expect(sent).toEqual([])

  mounted.setup.mockInput.pressKey("n")
  await Bun.sleep(10)
  const after = await mounted.frame()
  expect(mounted.confirm.dialog()).toBeNull()
  expect(after).not.toContain("gh pr merge 1259")
  expect(after).not.toContain("auto-merge armed")
  expect(sent).toEqual([])
})
