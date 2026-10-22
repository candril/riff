import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import type { AppKeyContext } from "./key-context"
import { createAppKeys } from "./keys"
import { mountApp } from "../testing/app-render"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"
import { toggleUnviewedFilesOnly } from "./tree-unviewed"
import type { PanelFilters } from "../storage/caches"
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
  const known: Partial<AppKeyContext> = {
    getState: render.getState,
    setState: render.setState,
    help: mounted.help,
    confirm: mounted.confirm,
    syncPreview: mounted.syncPreview,
    reviewPreview: mounted.reviewPreview,
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
    } as unknown as AppKeyContext["fileNavContext"],
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof AppKeyContext]
      return () => {
        throw new Error(`the unviewed toggle reached ctx.${String(name)}`)
      }
    },
  }) as AppKeyContext
  mounted.setup.renderer.keyInput.on("keypress", createAppKeys(mounted.setup.renderer, ctx))
}

/** The tree's columns of the frame, so the diff's file headers don't answer for it. */
async function treeText(): Promise<string> {
  return (await app!.frame())
    .split("\n")
    .map((line) => line.slice(0, 35).trimEnd())
    .join("\n")
}

/** The tree once `ready` holds: `x` redraws only after its write has landed. */
async function treeTextOnce(ready: (text: string) => boolean): Promise<string> {
  let text = await treeText()
  for (let i = 0; i < 100 && !ready(text); i++) {
    await Bun.sleep(5)
    text = await treeText()
  }
  return text
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

  test("x keeps the file it just marked, until x marks another", async () => {
    app = await mountApp(FILES, { width: 100, height: 20 })
    app.show({ focusedPanel: "tree" })
    app.ctx.updateFileTreePanel()
    keysOn(app, [])
    await app.frame()

    await app.setup.mockInput.typeText("H")
    await app.setup.mockInput.typeText("x")
    await until(() => app!.ctx.getState().fileStatuses.get("alpha.ts")?.viewed === true)
    expect(await treeText()).toContain("alpha.ts")

    await app.setup.mockInput.typeText("j")
    await app.setup.mockInput.typeText("x")
    await until(() => app!.ctx.getState().fileStatuses.get("bravo.ts")?.viewed === true)
    const after = await treeTextOnce((text) => text.includes("Files (2/4)"))
    expect(after).not.toContain("alpha.ts")
    expect(after).toContain("bravo.ts")
    expect(after).toContain("charlie.ts")
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

describe("a single file in view while viewed files are hidden", () => {
  const MANY = Array.from({ length: 30 }, (_, i) => `file${String(i).padStart(2, "0")}.ts`)

  test("the tree scrolls to the selected file's row", async () => {
    app = await mountApp(MANY.map(fileDiff).join(""), { width: 100, height: 14 })
    const files = app.ctx.getState().files
    const target = files.findIndex((file) => file.filename === "file26.ts")
    const viewed = new Map<string, FileReviewStatus>([["file26.ts", { filename: "file26.ts", viewed: true }]])
    app.show({ treeUnviewedOnly: true, fileStatuses: viewed, focusedPanel: "diff", treeHighlightIndex: 0 })
    app.ctx.updateFileTreePanel()
    // The header names the selected file too; only the rows under it say where the tree is.
    const rows = async () => (await treeText()).split("\n").slice(1).join("\n")
    expect(await rows()).not.toContain("file26.ts")

    app.show({ selectedFileIndex: target })
    app.ctx.updateFileTreePanel()
    const tree = await rows()
    expect(tree).toContain("file26.ts")
    expect(tree).not.toContain("file00.ts")
  })
})
