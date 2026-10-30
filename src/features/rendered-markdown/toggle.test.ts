import { describe, expect, test } from "bun:test"
import type { AppState } from "../../state"
import type { DiffFile } from "../../utils/diff-parser"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { VimCursorState } from "../../vim-diff/types"
import { createFileContentState } from "../file-content/state"
import { createRenderedMarkdownState } from "./state"
import { toggleRendered, type ToggleRenderedDeps } from "./toggle"

const README = ["# shop", "", "Intro", "", "## Shipping", "", "- fast", "- cheap"].join("\n")

// The hunk ends at line 5, so the rest of the file is a divider at the bottom.
const readme: DiffFile = {
  filename: "README.md",
  additions: 2,
  deletions: 0,
  status: "modified",
  content: [
    "diff --git a/README.md b/README.md",
    "--- a/README.md",
    "+++ b/README.md",
    "@@ -1,3 +1,5 @@",
    " # shop",
    " ",
    " Intro",
    "+",
    "+## Shipping",
  ].join("\n"),
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => (resolve = res))
  return { promise, resolve }
}

/** gR's deps over README.md, with a load the test settles by hand and every call recorded in order. */
function harness({ files = [readme], loaded = true }: { files?: DiffFile[]; loaded?: boolean } = {}) {
  const fileContent = createFileContentState()
  if (loaded) fileContent.set("README.md", README, null)
  const rendered = createRenderedMarkdownState()
  let state = { viewMode: "diff", focusedPanel: "diff", selectedFileIndex: null, files } as unknown as AppState
  const build = () => {
    const contents = new Map<string, string>()
    for (const [filename, entry] of Object.entries(fileContent.contents())) {
      if (entry.newContent) contents.set(filename, entry.newContent)
    }
    const renderedFiles = new Map(
      [...rendered.files()].flatMap((filename) => {
        const content = contents.get(filename)
        return content === undefined ? [] : [[filename, rendered.rowsFor(filename, content)] as const]
      })
    )
    return new DiffLineMapping(state.files, "all", undefined, { fileContents: contents, renderedFiles })
  }
  let mapping = build()
  let vim = { line: 0, col: 0, desiredCol: null } as unknown as VimCursorState
  const calls: string[] = []
  const toasts: string[] = []
  const placed: Array<{ line: number; rendered: boolean }> = []
  let load = deferred()
  const loads: string[] = []

  const deps: ToggleRenderedDeps = {
    getState: () => state,
    getMapping: () => mapping,
    getVimState: () => vim,
    setVimState: (next) => {
      calls.push("setVimState")
      placed.push({ line: next.line, rendered: mapping.getLine(next.line)?.rendered === true })
      vim = next
    },
    rendered: {
      has: rendered.has,
      toggle: (filename) => {
        calls.push("toggle")
        rendered.toggle(filename)
      },
    },
    fileContent,
    loadFileContent: (filename) => {
      loads.push(filename)
      // The app's loader draws the file as loading, and again once it is read.
      fileContent.markLoading(filename)
      calls.push("render")
      return load.promise.then(() => void calls.push("render"))
    },
    rebuildLineMapping: () => {
      calls.push("rebuild")
      mapping = build()
    },
    cursorView: { onceRebuilt: (then) => then(), landCursor: () => calls.push("landCursor") },
    toast: {
      show: (message) => toasts.push(message),
      clear: () => {},
      current: () => null,
    },
    render: () => calls.push("render"),
  }

  const lineOf = (content: string) => mapping.allLines.findIndex((line) => line.content === content)
  return {
    deps,
    fileContent,
    rendered,
    calls,
    toasts,
    placed,
    loads,
    lineOf,
    cursorRow: () => mapping.getLine(vim.line),
    jumpTo: (line: number) => (vim = { ...vim, line }),
    setState: (patch: Partial<AppState>) => (state = { ...state, ...patch }),
    /** Settle the pending read with `content` as the new version, or as a failure with `error`. */
    land: async (result: { content: string } | { error: string }) => {
      if ("content" in result) fileContent.set("README.md", result.content, null)
      else fileContent.setError("README.md", result.error)
      load.resolve()
      load = deferred()
      await Bun.sleep(0)
    },
    gR: () => toggleRendered(deps),
  }
}

describe("toggleRendered", () => {
  test("with the read in flight, the toggle waits for it and then lands the cursor on its source line", async () => {
    const app = harness({ loaded: false })
    app.jumpTo(app.lineOf("## Shipping"))
    const done = app.gR()
    await Bun.sleep(0)
    expect(app.rendered.has("README.md")).toBe(false)
    expect(app.placed).toEqual([])

    await app.land({ content: README })
    await done
    expect(app.rendered.has("README.md")).toBe(true)
    expect(app.cursorRow()).toMatchObject({ content: "Shipping", newLineNum: 5, rendered: true })
    expect(app.placed).toEqual([{ line: app.lineOf("Shipping"), rendered: true }])
    expect(app.calls.slice(app.calls.indexOf("toggle"))).toEqual(["toggle", "rebuild", "setVimState", "render", "landCursor"])
  })

  test("with the file already loading for another reader, gR still waits for the read and places the cursor", async () => {
    const app = harness({ loaded: false })
    app.jumpTo(app.lineOf("## Shipping"))
    app.fileContent.markLoading("README.md")
    // The app's loader joins the read under way; this one hands back the pending read.
    const done = app.gR()
    await Bun.sleep(0)
    expect(app.loads).toEqual(["README.md"])
    expect(app.rendered.has("README.md")).toBe(false)

    await app.land({ content: README })
    await done
    expect(app.rendered.has("README.md")).toBe(true)
    expect(app.cursorRow()).toMatchObject({ content: "Shipping", newLineNum: 5 })
  })

  test("the toggle, the rebuild and the cursor come before any render", async () => {
    const app = harness()
    app.jumpTo(app.lineOf("## Shipping"))
    await app.gR()
    expect(app.calls).toEqual(["toggle", "rebuild", "setVimState", "render", "landCursor"])
    expect(app.cursorRow()).toMatchObject({ content: "Shipping", rendered: true })
  })

  test("a failed read leaves the toggle off and says it could not read the file", async () => {
    const app = harness({ loaded: false })
    app.jumpTo(app.lineOf("## Shipping"))
    const done = app.gR()
    await app.land({ error: "Not Found" })
    await done
    expect(app.rendered.has("README.md")).toBe(false)
    expect(app.toasts).toEqual(["Could not read README.md's new version: Not Found"])
    expect(app.calls).not.toContain("toggle")
  })

  test("an empty new version leaves the toggle off: there is nothing to render", async () => {
    const app = harness({ loaded: false })
    app.jumpTo(app.lineOf("## Shipping"))
    const done = app.gR()
    await app.land({ content: "" })
    await done
    expect(app.rendered.has("README.md")).toBe(false)
    expect(app.toasts).toEqual(["README.md is empty: nothing to render"])
  })

  test("a deleted file has no new version to render", async () => {
    const app = harness({ files: [{ ...readme, status: "deleted" }] })
    app.jumpTo(app.lineOf("## Shipping"))
    await app.gR()
    expect(app.toasts).toEqual(["A deleted file has no new version to render"])
    expect(app.rendered.has("README.md")).toBe(false)
    expect(app.loads).toEqual([])
  })

  test("on the divider closing the file, the cursor stands for the last new line above it", async () => {
    const app = harness()
    const divider = app.lineOf("## Shipping") + 1
    app.jumpTo(divider)
    expect(app.deps.getMapping().getLine(divider)?.type).toBe("divider")
    await app.gR()
    expect(app.cursorRow()).toMatchObject({ content: "Shipping", newLineNum: 5 })
  })

  test("a diff that changed while the read was pending takes no toggle", async () => {
    const app = harness({ loaded: false })
    app.jumpTo(app.lineOf("## Shipping"))
    const done = app.gR()
    app.fileContent.clear()
    await app.land({ content: README })
    await done
    expect(app.rendered.has("README.md")).toBe(false)
    expect(app.placed).toEqual([])
  })

  test("leaving the diff while the read was pending takes no toggle", async () => {
    const app = harness({ loaded: false })
    app.jumpTo(app.lineOf("## Shipping"))
    const done = app.gR()
    app.setState({ viewMode: "feed" } as Partial<AppState>)
    await app.land({ content: README })
    await done
    expect(app.rendered.has("README.md")).toBe(false)
  })
})
