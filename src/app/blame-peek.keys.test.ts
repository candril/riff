import { afterEach, describe, expect, test } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import type { BlameDeps } from "../features/blame/keys"
import type { BlameSide } from "../providers/blame/sides"
import type { LineBlame } from "../providers/blame/source"
import type { RepoRef } from "../providers/repo"
import { switchView } from "../state"

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
@@ -40,2 +40,2 @@
 far
 away
`

const RENAMED = `diff --git a/src/hello.ts b/src/greet.ts
similarity index 80%
rename from src/hello.ts
rename to src/greet.ts
index 1111111..2222222 100644
--- a/src/hello.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
`

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"
const commit = (pr: LineBlame["pr"]): LineBlame => ({
  line: {
    kind: "commit",
    commit: { sha: SHA, shortSha: "a1b2c3d4", author: "Ada Lovelace", date: "2026-10-18T09:30:00Z", subject: "Say hello, not hi" },
  },
  pr,
})
const PR = { number: 12, url: "https://github.com/o/r/pull/12" }

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  const done = app
  app = null
  await done?.dispose()
})

/** Every outside call gB can make, recorded, with each answer held until the test settles it. */
function stubBlame(repo: RepoRef | null = { owner: "o", repo: "r" }) {
  const asked: [string, BlameSide, number][] = []
  const pending: { resolve: (r: LineBlame | null) => void; reject: (e: Error) => void }[] = []
  const opened: string[] = []
  const copied: string[] = []
  const deps: BlameDeps = {
    source: {
      fileBlame: () => Promise.reject(new Error("the peek reads one line")),
      lineBlame(path, side, line) {
        asked.push([path, side, line])
        return new Promise((resolve, reject) => pending.push({ resolve, reject }))
      },
    },
    openUrl: (url) => void opened.push(url),
    copy: async (text) => {
      copied.push(text)
      return { ok: true }
    },
    repoRef: async () => repo,
    splitRows: () => app!.ctx.split.splitRows(),
  }
  return { deps, asked, opened, copied, answer: (r: LineBlame | null) => pending.at(-1)!.resolve(r), fail: (m: string) => pending.at(-1)!.reject(new Error(m)) }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const press = (...keys: string[]) => keys.forEach((key) => app!.setup.mockInput.pressKey(key))
const lineOf = (content: string) => app!.ctx.getLineMapping().allLines.findIndex((line) => line.content === content)

async function mount(repo?: RepoRef | null, width = 120, diff = DIFF) {
  app = await mountApp(diff, { width, height: 24 })
  app.show()
  // Lets the diff take its laid-out size now, rather than after the test has torn the renderer down.
  await app.frame()
  const blame = stubBlame(repo)
  const mounted = app
  // A toast clears itself two seconds on, long after this test's renderer is gone.
  const keys = keysOn(app, { blame: blame.deps, render: () => app === mounted && mounted.render() })
  return { ...blame, ...keys }
}

describe("gB", () => {
  test("on an added line asks the head for its new number, and the peek fills in when blame arrives", async () => {
    const { asked, answer, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    press("g", "B")
    expect(asked).toEqual([["src/greet.ts", "head", 2]])
    expect(await app!.frame()).toContain("Reading blame…")

    answer(commit(PR))
    await flush()
    const frame = await app!.frame()
    expect(frame).toContain("a1b2c3d4 Ada Lovelace")
    expect(frame).toContain("Say hello, not hi")
    expect(frame).toContain("#12")
    expect(frame).toContain("go: open PR #12 · y: copy sha · Esc: close")
  })

  test("on a removed line asks the base", async () => {
    const { asked, jumpTo } = await mount()
    jumpTo(lineOf('  return "hi"'))
    press("g", "B")
    expect(asked).toEqual([["src/greet.ts", "base", 2]])
  })

  test("on a removed line of a renamed file asks the base under its old name, and the peek names it", async () => {
    const { asked, jumpTo } = await mount(undefined, 120, RENAMED)
    jumpTo(lineOf('  return "hi"'))
    press("g", "B")
    expect(asked).toEqual([["src/hello.ts", "base", 2]])
    const frame = await app!.frame()
    expect(frame).toContain("src/hello.ts:2")
    expect(frame).toContain("base")
  })

  test("y copies the full sha and go opens the PR", async () => {
    const { answer, copied, opened, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    press("g", "B")
    answer(commit(PR))
    await flush()
    press("y")
    await flush()
    expect(copied).toEqual([SHA])
    expect(app!.toast.current()?.message).toBe("Copied a1b2c3d4")
    press("g", "o")
    await flush()
    expect(opened).toEqual([PR.url])
  })

  test("go opens the commit when no PR brought it in", async () => {
    const { answer, opened, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    press("g", "B")
    answer(commit(null))
    await flush()
    press("g", "o")
    await flush()
    expect(opened).toEqual([`https://github.com/o/r/commit/${SHA}`])
  })

  test("go with no GitHub remote says so instead of opening anything", async () => {
    const { answer, opened, jumpTo } = await mount(null)
    jumpTo(lineOf('  return "hello"'))
    press("g", "B")
    answer(commit(null))
    await flush()
    press("g", "o")
    await flush()
    expect(opened).toEqual([])
    expect(app!.toast.current()?.message).toBe("No GitHub remote to open the commit on")
  })

  test("while the peek is up j stays put; Esc closes it and j moves again", async () => {
    const { vimState, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    const before = vimState().line
    press("g", "B")
    expect(await app!.frame()).toContain("Reading blame…")
    press("j")
    expect(vimState().line).toBe(before)
    app!.setup.mockInput.pressEscape()
    await Bun.sleep(50)
    expect(app!.blamePeek.open()).toBe(false)
    expect(await app!.frame()).not.toContain("Reading blame…")
    press("j")
    expect(vimState().line).toBe(before + 1)
  })

  test("q and gB again close the peek too", async () => {
    const { jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    press("g", "B")
    press("q")
    expect(app!.blamePeek.open()).toBe(false)
    press("g", "B")
    expect(app!.blamePeek.open()).toBe(true)
    press("g", "B")
    expect(app!.blamePeek.open()).toBe(false)
  })

  test("a failed read shows its message", async () => {
    const { fail, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    press("g", "B")
    fail("jj: Revision `trunk()` doesn't exist")
    await flush()
    expect(await app!.frame()).toContain("jj: Revision `trunk()` doesn't exist")
  })

  test("a line not yet committed says so, and y copies nothing", async () => {
    const { answer, copied, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    press("g", "B")
    answer({ line: { kind: "uncommitted" }, pr: null })
    await flush()
    expect(await app!.frame()).toContain("Not committed yet")
    press("y")
    await flush()
    expect(copied).toEqual([])
    expect(app!.toast.current()?.message).toBe("Not committed yet")
  })

  test("on a divider there is no line to blame", async () => {
    const { asked, jumpTo } = await mount()
    jumpTo(app!.ctx.getLineMapping().allLines.findIndex((line) => line.type === "divider"))
    press("g", "B")
    expect(asked).toEqual([])
    expect(app!.blamePeek.open()).toBe(false)
    expect(app!.toast.current()?.message).toBe("No line to blame here")
  })

  test("with no blame peek, go opens nothing in a local review", async () => {
    const { opened } = await mount()
    press("g", "o")
    await flush()
    expect(opened).toEqual([])
  })

  test("in split, the left pane of a modified row asks the base", async () => {
    const { asked, jumpTo } = await mount(undefined, 240)
    press("\\")
    expect(app!.diffOptions.splitView()).toBe(true)
    jumpTo(lineOf('  return "hi"'))
    app!.ctx.split.syncPane()
    expect(app!.ctx.split.splitRows()?.side).toBe("left")
    press("g", "B")
    expect(asked).toEqual([["src/greet.ts", "base", 2]])
  })

  test("with the peek up gg, gi and gl move nothing and open nothing, and the peek stays drawn", async () => {
    const { vimState, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    const before = vimState().line
    press("g", "B")
    press("g", "g", "g", "i", "g", "l")
    const state = app!.ctx.getState()
    expect(vimState().line).toBe(before)
    expect(state.viewMode).toBe("diff")
    expect(app!.linePeek.open()).toBe(false)
    expect(app!.blamePeek.open()).toBe(true)
    expect(await app!.frame()).toContain("Reading blame…")
  })

  test("with the line peek up gB does not open the blame peek", async () => {
    const { asked, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    press("g", "l")
    expect(app!.linePeek.open()).toBe(true)
    press("g", "B")
    expect(asked).toEqual([])
    expect(app!.blamePeek.open()).toBe(false)
  })

  test("a view switch closes the peek, and it stays closed on return", async () => {
    const { jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    press("g", "B")
    expect(await app!.frame()).toContain("Reading blame…")
    // The peek holds i and d, so the switch comes from outside the keys, each followed by a pass as the app's are.
    app!.ctx.setState((s) => switchView({ ...s, appMode: "pr" }, "state"))
    app!.render()
    expect(app!.blamePeek.open()).toBe(false)
    app!.ctx.setState((s) => switchView(s, "diff"))
    app!.render()
    expect(app!.ctx.getState().viewMode).toBe("diff")
    expect(app!.blamePeek.open()).toBe(false)
    expect(await app!.frame()).not.toContain("Reading blame…")
  })

  test("while blame loads, go and y say so", async () => {
    const { opened, copied, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    press("g", "B")
    press("y")
    expect(app!.toast.current()?.message).toBe("Blame is still loading")
    app!.toast.clear()
    press("g", "o")
    await flush()
    expect(app!.toast.current()?.message).toBe("Blame is still loading")
    expect(opened).toEqual([])
    expect(copied).toEqual([])
  })

  test("after a failed read, go and y say there is no commit", async () => {
    const { fail, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    press("g", "B")
    fail("boom")
    await flush()
    press("y")
    expect(app!.toast.current()?.message).toBe("No commit to copy")
    press("g", "o")
    expect(app!.toast.current()?.message).toBe("No commit to open")
  })

  test("go on a line not yet committed says so", async () => {
    const { answer, opened, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    press("g", "B")
    answer({ line: { kind: "uncommitted" }, pr: null })
    await flush()
    press("g", "o")
    await flush()
    expect(opened).toEqual([])
    expect(app!.toast.current()?.message).toBe("Not committed yet")
  })
})
