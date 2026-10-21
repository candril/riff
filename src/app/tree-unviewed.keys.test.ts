import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { createKeyHandler, type GlobalKeyContext } from "./global-keys"
import { mountApp } from "../testing/app-render"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"
import { toggleUnviewedFilesOnly } from "./tree-unviewed"
import type { PanelFilters } from "../storage"
import type { FileReviewStatus } from "../types"

const fileDiff = (name: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,1 +1,1 @@
-export const old = 1
+export const now = 1
`

const FILES = ["alpha.ts", "bravo.ts", "charlie.ts", "delta.ts"].map(fileDiff).join("")

// `x` saves the viewed state into the repo's `.riff`: a throwaway repo takes
// it rather than the working copy the tests run from.
const cwd = process.cwd()
let root = ""
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "riff-tree-unviewed-"))
  await mkdir(join(root, ".git"), { recursive: true })
  process.chdir(root)
})
afterAll(async () => {
  process.chdir(cwd)
  await rm(root, { recursive: true, force: true })
})

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/**
 * riff's key handler on the app's render pass. The toggle is app.ts's with
 * the save stubbed, so the test sees what it would write without writing it.
 */
function keysOn(mounted: NonNullable<typeof app>, saves: Partial<PanelFilters>[]) {
  const { ctx: render } = mounted
  let vimState = render.getVimState()
  const setVimState = (next: typeof vimState) => {
    vimState = next
    mounted.setVimState(next)
  }
  const known: Partial<GlobalKeyContext> = {
    getState: render.getState,
    setState: render.setState,
    getVimState: () => vimState,
    setVimState,
    getLineMapping: render.getLineMapping,
    getFlashState: () => createFlashState(),
    getSearchState: () => createSearchState(),
    renderer: mounted.setup.renderer,
    render: mounted.render,
    ensureCursorVisible: () => {},
    fileTreePanel: mounted.fileTreePanel,
    updateFileTreePanel: render.updateFileTreePanel,
    toggleUnviewedFilesOnly: () => {
      const cursorFile = render.getLineMapping().getLine(vimState.line)?.filename ?? null
      render.setState((s) =>
        toggleUnviewedFilesOnly(s, cursorFile, async (_source, patch) => {
          saves.push(patch)
        })
      )
      mounted.render()
    },
    fileNavContext: {
      getState: render.getState,
      setState: render.setState,
      createLineMapping: () => {},
      getHeadSha: () => "abc1234",
      setHeadSha: () => {},
      source: "test",
      mode: "local",
      prInfo: null,
    } as unknown as GlobalKeyContext["fileNavContext"],
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof GlobalKeyContext]
      return () => {
        throw new Error(`the unviewed toggle reached ctx.${String(name)}`)
      }
    },
  }) as GlobalKeyContext
  mounted.setup.renderer.keyInput.on("keypress", createKeyHandler(ctx))
}

/** The tree's columns of the frame, so the diff's file headers don't answer for it. */
async function treeText(): Promise<string> {
  return (await app!.frame())
    .split("\n")
    .map((line) => line.slice(0, 35).trimEnd())
    .join("\n")
}

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !done(); i++) await Bun.sleep(5)
  expect(done()).toBe(true)
}

describe("H in the file tree", () => {
  test("hides viewed files but keeps the one just marked, through j, and H again shows all", async () => {
    app = await mountApp(FILES, { width: 100, height: 20 })
    const viewed = new Map<string, FileReviewStatus>([["charlie.ts", { filename: "charlie.ts", viewed: true }]])
    app.show({ focusedPanel: "tree", fileStatuses: viewed })
    app.ctx.updateFileTreePanel()
    const saves: Partial<PanelFilters>[] = []
    keysOn(app, saves)
    const before = await treeText()
    expect(before).toContain("charlie.ts")

    await app.setup.mockInput.typeText("x")
    await until(() => app!.ctx.getState().fileStatuses.get("alpha.ts")?.viewed === true)

    await app.setup.mockInput.typeText("H")
    expect(app.ctx.getState().treeUnviewedOnly).toBe(true)
    expect(saves).toEqual([{ unviewedFilesOnly: true }])
    const filtered = await treeText()
    expect(filtered).toContain("Files (2/4)  unviewed only · 1 h")
    expect(filtered).toContain("alpha.ts")
    expect(filtered).toContain("bravo.ts")
    expect(filtered).toContain("delta.ts")
    expect(filtered).not.toContain("charlie.ts")

    await app.setup.mockInput.typeText("j")
    expect(app.ctx.getState().treeHighlightIndex).toBe(1)
    const moved = await treeText()
    expect(moved).toContain("alpha.ts")
    expect(moved).not.toContain("charlie.ts")

    await app.setup.mockInput.typeText("H")
    expect(app.ctx.getState().treeUnviewedOnly).toBe(false)
    expect(saves).toEqual([{ unviewedFilesOnly: true }, { unviewedFilesOnly: false }])
    const all = await treeText()
    expect(all).toContain("charlie.ts")
    expect(all).not.toContain("unviewed only")
    expect(app.ctx.getState().treeHighlightIndex).toBe(1)
  })

  test("a shifted h toggles rather than folding", async () => {
    app = await mountApp(FILES, { width: 100, height: 20 })
    app.show({ focusedPanel: "tree" })
    app.ctx.updateFileTreePanel()
    keysOn(app, [])
    await app.frame()
    app.setup.mockInput.pressKey("h", { shift: true })
    expect(app.ctx.getState().treeUnviewedOnly).toBe(true)
    expect(await treeText()).toContain("Files (0/4)  unviewed only · 0 h")
  })
})
