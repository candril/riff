import { afterEach, describe, expect, test } from "bun:test"
import { BLAME_CELLS } from "../components/blame-column-model"
import type { BlameDeps } from "../features/blame/keys"
import type { BlameSide } from "../providers/blame/sides"
import type { LoadedFileBlame } from "../providers/blame/source"
import type { BlameLine } from "../providers/blame/types"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { routeDiffViewport } from "./diff-viewport"

const WIDE = `const wide = "${"x".repeat(150)}"`
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
 ${WIDE}
`

const ADA: BlameLine = {
  kind: "commit",
  commit: { sha: `a1b2c3d4${"0".repeat(32)}`, shortSha: "a1b2c3d4", author: "Ada Lovelace", date: "2026-10-18T09:30:00Z", subject: "s" },
}
const loaded = (lines: number): LoadedFileBlame => ({ blame: [undefined, ...Array.from({ length: lines }, () => ADA)], prs: null })

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  const done = app
  app = null
  await done?.dispose()
})

/** Every fileBlame zB asks, recorded, with each answer held until the test settles it. */
function stubBlame() {
  const asked: [string, BlameSide][] = []
  const pending: { side: BlameSide; resolve: (r: LoadedFileBlame | null) => void; reject: (e: Error) => void }[] = []
  const deps: BlameDeps = {
    source: {
      fileBlame(path, side) {
        asked.push([path, side])
        return new Promise((resolve, reject) => pending.push({ side, resolve, reject }))
      },
      lineBlame: () => Promise.reject(new Error("the column reads whole files")),
    },
    openUrl: () => {
      throw new Error("zB opens nothing")
    },
    copy: async () => ({ ok: true }),
    repoRef: async () => null,
    splitRows: () => app!.ctx.split.splitRows(),
  }
  const answer = (head: LoadedFileBlame | null, base: LoadedFileBlame | null) =>
    pending.splice(0).forEach((p) => p.resolve(p.side === "head" ? head : base))
  const fail = (message: string) => pending.splice(0).forEach((p) => p.reject(new Error(message)))
  return { deps, asked, answer, fail }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const press = (...keys: string[]) => keys.forEach((key) => app!.setup.mockInput.pressKey(key))
const zB = () => {
  press("z")
  app!.setup.mockInput.pressKey("b", { shift: true })
}
const lineOf = (content: string) => app!.ctx.getLineMapping().allLines.findIndex((line) => line.content === content)
const cursorX = () => app!.setup.renderer.getCursorState().x

async function mount() {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  app.show()
  await app.frame()
  const blame = stubBlame()
  const mounted = app
  const { ctx } = app
  const cursorView = routeDiffViewport(ctx.unified, {
    shown: ctx.split.shown,
    island: ctx.split.island,
    rowAtLine: ctx.split.rowAtLine,
    refreshCursor: () => {},
  })
  // A toast clears itself two seconds on, long after this test's renderer is gone.
  const keys = keysOn(app, { blame: blame.deps, cursorView, render: () => app === mounted && mounted.render() })
  return { ...blame, ...keys }
}

describe("zB", () => {
  test("turns the file's column on, shows … while blame loads, names the commit once it lands, and turns it off", async () => {
    const { asked, answer, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    zB()
    expect(asked).toEqual([
      ["src/greet.ts", "head"],
      ["src/greet.ts", "base"],
    ])
    expect(app!.ctx.getState().blameColumns.get("src/greet.ts")).toEqual({ status: "loading" })
    expect(await app!.frame()).toContain("…")

    answer(loaded(41), loaded(41))
    await flush()
    let frame = await app!.frame()
    expect(frame).toContain("a1b2c3d4 Ada Love")
    expect(frame).not.toContain("…")

    zB()
    expect(app!.ctx.getState().blameColumns.size).toBe(0)
    frame = await app!.frame()
    expect(frame).not.toContain("a1b2c3d4")
  })

  test("a failed read toasts why and leaves no column", async () => {
    const { fail, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    zB()
    fail("jj: no such revision")
    await flush()
    expect(app!.ctx.getState().blameColumns.size).toBe(0)
    expect(app!.ctx.getState().toast).toMatchObject({ message: "Blame failed: jj: no such revision", type: "error" })
    expect(await app!.frame()).not.toContain("…")
  })

  test("no blame on either side says so and leaves no column", async () => {
    const { answer, jumpTo } = await mount()
    jumpTo(lineOf('  return "hello"'))
    zB()
    answer(null, null)
    await flush()
    expect(app!.ctx.getState().blameColumns.size).toBe(0)
    expect(app!.ctx.getState().toast).toMatchObject({ message: "No blame for src/greet.ts", type: "info" })
  })

  test("the terminal cursor moves BLAME_CELLS right, and l and h still step it a cell at a time", async () => {
    const { answer, jumpTo, vimState } = await mount()
    jumpTo(lineOf("far"))
    app!.render()
    await app!.frame()
    const before = cursorX()
    zB()
    answer(loaded(41), loaded(41))
    await flush()
    await app!.frame()
    expect(cursorX()).toBe(before + BLAME_CELLS)
    press("l")
    await app!.frame()
    expect(vimState().col).toBe(1)
    expect(cursorX()).toBe(before + BLAME_CELLS + 1)
    press("h")
    await app!.frame()
    expect(cursorX()).toBe(before + BLAME_CELLS)
  })

  test("sideways scrolling still slides a long line under the narrower code window", async () => {
    const { answer, jumpTo } = await mount()
    jumpTo(lineOf(WIDE))
    zB()
    answer(loaded(41), loaded(41))
    await flush()
    const row = (frame: string) => frame.split("\n").find((line) => line.includes('const wide') || line.includes("xxxxxxxx"))!
    const before = row(await app!.frame())
    expect(before).toContain("›")
    press("z", "l")
    const after = row(await app!.frame())
    expect(after).toContain("‹")
    // The marker takes the gutter's last cell, so the code still starts where the column leaves it.
    expect(after.indexOf("‹") + 1).toBe(before.indexOf("const"))
    expect(before.indexOf("const")).toBe(2 + BLAME_CELLS + 4)
  })
})
