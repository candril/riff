import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import type { AppKeyContext } from "./key-context"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn } from "../testing/chat-keys"
import { pinStdoutColumns } from "../testing/frame"
import { PR_NOW, prInfo } from "../testing/pr-info"
import { fullPr } from "../testing/pr-info-panel"
import { overviewState, prInfoPanelKeys } from "../testing/pr-info-panel-keys"
import { PRInfoPanelClass } from "../components/PRInfoPanel"
import type { PRInfoPanelSection } from "../state"
import type { Comment } from "../types"

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

// The sections a reader who had opened these two before comes back to.
const OPENED_BEFORE: ReadonlySet<PRInfoPanelSection> = new Set(["checks", "description"])

let app: Awaited<ReturnType<typeof mountApp>> | null = null
let panel: PRInfoPanelClass | null = null
let restoreColumns: (() => void) | null = null
// The panel's times read the clock.
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

/** riff on the PR overview, its keys through the real createAppKeys. */
async function overviewApp() {
  app = await mountApp(DIFF, { width: 120, height: 40 })
  const mounted = app
  const info = fullPr()
  const shown = new PRInfoPanelClass(mounted.setup.renderer, info, mounted.ctx.getState().files, [], OPENED_BEFORE)
  panel = shown
  mounted.setPrInfoPanel(shown)
  const flashes: string[] = []
  keysOn(mounted, {
    getPrInfoPanel: () => shown,
    flashHandler: {
      startList: (surface: string) => void flashes.push(surface),
    } as unknown as AppKeyContext["flashHandler"],
  })
  mounted.show({ appMode: "pr", prInfo: info, viewMode: "state", focusedPanel: "diff" })
  await mounted.frame()
  return { mounted, flashes }
}

test("za folds the description the cursor starts on", async () => {
  const { mounted } = await overviewApp()
  expect(await mounted.frame()).toContain("▼  Description (2)")

  mounted.setup.mockInput.pressKey("z")
  mounted.setup.mockInput.pressKey("a")
  const frame = await mounted.frame()
  expect(frame).toContain("▶  Description (2)  2 lines")
  expect(frame).not.toContain("Second line with code.")
})

test("j walks through the description's two lines down to the previews, past them to the conversation, k back up, and za unfolds where it lands", async () => {
  const { mounted } = await overviewApp()
  expect(await mounted.frame()).toContain("▶  Conversation (7)")

  for (let i = 0; i < 4; i++) mounted.setup.mockInput.pressKey("j")
  mounted.setup.mockInput.pressKey("z")
  mounted.setup.mockInput.pressKey("a")
  expect(await mounted.frame()).toContain("▼  Conversation (7)")

  mounted.setup.mockInput.pressKey("k")
  mounted.setup.mockInput.pressKey("z")
  mounted.setup.mockInput.pressKey("a")
  expect(await mounted.frame()).toContain("▼  Previews (0)")
})

test("the overview opens on the merge status with its verdict, and h, l and Enter on its checks line fold and open the checks", async () => {
  const { mounted } = await overviewApp()
  const arrival = await mounted.frame()
  expect(arrival).toMatch(/▼  Merge status +✗ blocked/)
  expect(arrival).toContain("✗ Checks         1/6 · test, e2e +2 failing  ▼")
  expect(arrival).toContain("      ✓ build")

  // Up from the description's header is the merge status's last gate; the
  // checks line is the first of its twelve rows.
  for (let i = 0; i < 12; i++) mounted.setup.mockInput.pressKey("k")
  mounted.setup.mockInput.pressKey("h")
  const folded = await mounted.frame()
  expect(folded).toContain("✗ Checks         1/6 · test, e2e +2 failing  ▶")
  expect(folded).not.toContain("✓ build")

  mounted.setup.mockInput.pressKey("l")
  expect(await mounted.frame()).toContain("      ✓ build")

  mounted.setup.mockInput.pressEnter()
  expect(await mounted.frame()).not.toContain("✓ build")
  mounted.setup.mockInput.pressKey("j")
  mounted.setup.mockInput.pressEnter()
  expect(await mounted.frame()).toContain("✗ Checks         1/6 · test, e2e +2 failing  ▶")
})

test("/ opens the overview's filter prompt", async () => {
  const { mounted } = await overviewApp()
  expect(await mounted.frame()).not.toContain("/filter rows…")

  mounted.setup.mockInput.pressKey("/")
  expect(await mounted.frame()).toContain("/filter rows…")
})

test("Ctrl-r still opens the chat from the overview, and a bare s still starts flash on it", async () => {
  const { mounted, flashes } = await overviewApp()
  mounted.setup.mockInput.pressKey("s")
  expect(flashes).toEqual(["state"])

  ctrl(mounted, "r")
  expect(mounted.chatColumnState.open()).toBe(true)
  expect(mounted.ctx.getState().focusedPanel).toBe("chat")
  await mounted.frame()
})

describe("the merge status's conversations line", () => {
  const THREAD: Comment = {
    id: "gh-41",
    filename: "src/greet.ts",
    line: 2,
    side: "RIGHT",
    body: "Rename this",
    createdAt: PR_NOW.toISOString(),
    status: "synced",
    author: "bob",
    isThreadResolved: false,
    githubUrl: "https://github.com/o/r/pull/1#discussion_r41",
  }

  /**
   * The overview's keys on a real panel showing one unresolved thread, the
   * cursor on the conversations line (the third gate, with no checks), and
   * every spawn — a browser, the clipboard — caught instead of run.
   */
  async function onConversations() {
    const { renderer } = await createTestRenderer({ width: 120, height: 40 })
    const info = prInfo("", { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", checks: [] })
    const shown = new PRInfoPanelClass(renderer, info, [], [THREAD], OPENED_BEFORE)
    const spawned = spyOn(Bun, "spawn").mockImplementation(((cmd: string[]) => ({
      cmd,
      stdin: { write() {}, end: async () => {} },
      exited: Promise.resolve(0),
    })) as unknown as typeof Bun.spawn)
    const keys = await prInfoPanelKeys(overviewState({ prInfo: info }), { controller: shown })
    shown.setActiveSection("checks")
    shown.moveCursor(3)
    return {
      keys,
      panel: shown,
      spawned: () => spawned.mock.calls.map(([cmd]) => (cmd as string[]).join(" ")),
      dispose: () => {
        spawned.mockRestore()
        shown.destroy()
        renderer.destroy()
      },
    }
  }

  test("l opens it, j steps onto the thread, and Enter closes the panel onto that thread", async () => {
    const { keys, panel, dispose } = await onConversations()
    try {
      keys.press("l")
      keys.press("j")
      expect(panel.getSelectedMergeThread()?.id).toBe("gh-41")
      keys.press("\r")
      expect(keys.calls).toEqual(["openThread gh-41"])
      expect(keys.state().viewMode).toBe("diff")
    } finally {
      dispose()
    }
  })

  test("o opens the thread on GitHub and y copies its body", async () => {
    const { keys, spawned, dispose } = await onConversations()
    try {
      keys.press("l")
      keys.press("j")
      keys.press("o")
      keys.press("y")
      expect(spawned()[0]).toBe("open https://github.com/o/r/pull/1#discussion_r41")
      expect(spawned()[1]).toMatch(/^(pbcopy|xclip)/)
      expect(spawned()).toHaveLength(2)
      await Bun.sleep(0)
      expect(keys.toast.current()?.message).toBe("Comment copied")
    } finally {
      dispose()
    }
  })
})
