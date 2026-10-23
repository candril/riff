import { afterEach, describe, expect, test } from "bun:test"
import type { AppKeyContext } from "./key-context"
import { createAppKeys } from "./keys"
import { mountApp } from "../testing/app-render"
import { failOnKeymapErrors } from "../testing/keymap-errors"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"
import type { FileReviewStatus } from "../types"

const fileDiff = (name: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,1 +1,1 @@
-export const old = 1
+export const now = 1
`

const MANY = Array.from({ length: 30 }, (_, i) => `file${String(i).padStart(2, "0")}.ts`)

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** riff's key handler on the app's render pass, with only what picking and stepping files reach. */
function keysOn(mounted: NonNullable<typeof app>) {
  const { ctx: render } = mounted
  let vimState = render.getVimState()
  const setVimState = (next: typeof vimState) => {
    vimState = next
    mounted.setVimState(next)
  }
  const rebuildLineMapping = () => mounted.show({ files: render.getState().files })
  const known: Partial<AppKeyContext> = {
    getState: render.getState,
    setState: render.setState,
    help: mounted.help,
    activityFeed: mounted.activityFeed,
    confirm: mounted.confirm,
    syncPreview: mounted.syncPreview,
    reviewPreview: mounted.reviewPreview,
    filePicker: mounted.filePicker,
    commentsPicker: mounted.commentsPicker,
    occurrencePicker: mounted.occurrencePicker,
    marksPicker: mounted.marksPicker,
    commitPicker: mounted.commitPicker,
    actionMenu: mounted.actionMenu,
    linePeek: mounted.linePeek,
    blamePeek: mounted.blamePeek,
    prCommentInput: mounted.prCommentInput,
    prInfoFilter: mounted.prInfoFilter,
    getVimState: () => vimState,
    setVimState,
    getLineMapping: render.getLineMapping,
    rebuildLineMapping,
    getFlashState: () => createFlashState(),
    getSearchState: () => createSearchState(),
    renderer: mounted.setup.renderer,
    render: mounted.render,
    ensureCursorVisible: () => {},
    fileTreePanel: mounted.fileTreePanel,
    updateFileTreePanel: render.updateFileTreePanel,
    fileNavContext: {
      getState: render.getState,
      setState: render.setState,
      getVimState: () => vimState,
      setVimState,
      getLineMapping: render.getLineMapping,
      createLineMapping: rebuildLineMapping,
      ensureCursorVisible: () => {},
      render: mounted.render,
      getHeadSha: () => "abc1234",
      setHeadSha: () => {},
    } as unknown as AppKeyContext["fileNavContext"],
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof AppKeyContext]
      return () => {
        throw new Error(`picking or stepping a file reached ctx.${String(name)}`)
      }
    },
  }) as AppKeyContext
  mounted.setup.renderer.keyInput.on("keypress", failOnKeymapErrors(createAppKeys(mounted.setup.renderer, ctx)))
}

/** The tree's rows under its header, which names the selected file too and so cannot say where the tree is. */
async function treeRows(): Promise<string> {
  return (await app!.frame())
    .split("\n")
    .slice(1)
    .map((line) => line.slice(0, 35).trimEnd())
    .join("\n")
}

const selectedName = () => {
  const state = app!.ctx.getState()
  return state.selectedFileIndex === null ? null : state.files[state.selectedFileIndex]?.filename
}

async function mountSingleFile(patch: Parameters<NonNullable<typeof app>["show"]>[0] = {}) {
  app = await mountApp(MANY.map(fileDiff).join(""), { width: 100, height: 14 })
  app.show({ focusedPanel: "diff", treeHighlightIndex: 0, selectedFileIndex: 0, ...patch })
  keysOn(app)
  expect(await treeRows()).toContain("file00.ts")
}

describe("a single file in view", () => {
  test("Ctrl-f onto a file far down scrolls the tree to it", async () => {
    await mountSingleFile()

    app!.setup.mockInput.pressKey("f", { ctrl: true })
    await app!.frame()
    await app!.setup.mockInput.typeText("file25")
    await app!.frame()
    app!.setup.mockInput.pressEnter()

    expect(selectedName()).toBe("file25.ts")
    const rows = await treeRows()
    expect(rows).toContain("file25.ts")
    expect(rows).not.toContain("file00.ts")
  })

  test("]f past the visible rows keeps the file it steps to drawn in the tree", async () => {
    await mountSingleFile()

    for (let step = 1; step <= 20; step++) {
      await app!.setup.mockInput.typeText("]f")
      const name = `file${String(step).padStart(2, "0")}.ts`
      expect(selectedName()).toBe(name)
      expect(await treeRows()).toContain(name)
    }
    expect(await treeRows()).not.toContain("file00.ts")
  })

  test("]f past the visible rows with viewed files hidden keeps the file drawn too", async () => {
    const viewed = new Map<string, FileReviewStatus>([["file03.ts", { filename: "file03.ts", viewed: true }]])
    await mountSingleFile({ treeUnviewedOnly: true, fileStatuses: viewed })
    expect(await treeRows()).not.toContain("file03.ts")

    const seen: string[] = []
    for (let step = 0; step < 20; step++) {
      await app!.setup.mockInput.typeText("]f")
      const name = selectedName()!
      seen.push(name)
      expect(await treeRows()).toContain(name)
    }
    expect(seen.at(-1)).toBe("file20.ts")
    expect(await treeRows()).not.toContain("file00.ts")
  })
})
