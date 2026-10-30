import { afterEach, expect, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import type { AppKeyContext } from "./key-context"
import { routeDiffViewport } from "./diff-viewport"
import { mountApp, reloadCtx } from "../testing/app-render"
import { adoptReloadedState } from "../features/refresh/handlers"
import { reloadRenderedFiles } from "../features/rendered-markdown/reload"
import { createInitialState } from "../state"
import { keysOn } from "../testing/chat-keys"
import { SearchHandler } from "../vim-diff/search-handler"

const README = ["# shop", "", "Intro", "", "## Shipping", "", "- fast", "- cheap"].join("\n")

const DIFF = [
  "diff --git a/README.md b/README.md",
  "index 1111111..2222222 100644",
  "--- a/README.md",
  "+++ b/README.md",
  "@@ -1,3 +1,8 @@",
  " # shop",
  " ",
  " Intro",
  "+",
  "+## Shipping",
  "+",
  "+- fast",
  "+- cheap",
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,3 +1,3 @@",
  " export function greet() {",
  '-  return "hi"',
  '+  return "hex"',
  " }",
  "",
].join("\n")

const SHIFT_R = "\x1b[82;2u"

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** riff's keys on a README and a .ts file, the README's new version loaded unless `loaded` is false. */
async function renderedApp({ loaded = true, more = {} }: { loaded?: boolean; more?: Partial<AppKeyContext> } = {}) {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  const mounted = app
  if (loaded) mounted.fileContent.set("README.md", README, "# shop\n\nIntro")
  mounted.show({ focusedPanel: "diff" })
  const { ctx: render } = mounted
  const cursorView = routeDiffViewport(render.unified, {
    shown: render.split.shown,
    island: render.split.island,
    rowAtLine: render.split.rowAtLine,
    refreshCursor: () => {},
  })
  let keys!: ReturnType<typeof keysOn>
  const vim = () => keys.vimState()
  const rebuildLineMapping = () => mounted.show({ files: render.getState().files })
  const searchHandler = new SearchHandler({
    getMapping: render.getLineMapping,
    getSearchState: render.getSearchState,
    setSearchState: mounted.setSearchState,
    getCursor: vim,
    setCursor: (line, col) => keys.setVim({ line, col }),
    getFileContent: () => null,
    loadFileContent: async () => {},
    expandDividerForLine: () => {},
    getCollapsedFiles: () => [],
    expandFiles: () => {},
    onUpdate: mounted.render,
  })
  mounted.onSearchPattern((value) => searchHandler.updatePattern(value))
  keys = keysOn(mounted, {
    cursorView,
    rebuildLineMapping,
    getSearchState: render.getSearchState,
    searchHandler,
    renderedMarkdown: mounted.renderedMarkdown,
    fileContent: mounted.fileContent,
    loadFileContent: async () => {
      throw new Error("the README is loaded already")
    },
    ...more,
  })
  await mounted.frame()
  const press = (sequence: string) =>
    mounted.setup.renderer.keyInput.emit("keypress", new KeyEvent(parseKeypress(sequence, { useKittyKeyboard: true })!))
  const type = (...sequences: string[]) => sequences.forEach(press)
  const gR = async () => {
    type("g", SHIFT_R)
    // The cursor lands after the rebuild, a microtask on.
    await Bun.sleep(0)
  }
  const lines = () => render.getLineMapping().allLines
  const lineOf = (content: string, file = "README.md") =>
    lines().findIndex((line) => line.content === content && line.filename === file)
  const cursorRow = () => render.getLineMapping().getLine(vim().line)
  return { mounted, keys, type, gR, vim, lines, lineOf, cursorRow }
}

test("gR on the README draws it rendered: headings without hashes, bulleted items, and the header says so", async () => {
  const { mounted, gR, keys, lineOf } = await renderedApp()
  keys.jumpTo(lineOf("## Shipping"))
  const before = await mounted.frame()
  expect(before).toContain("## Shipping")
  expect(before).not.toContain("rendered")

  await gR()
  const frame = await mounted.frame()
  expect(frame).toContain("Shipping")
  expect(frame).not.toContain("## Shipping")
  expect(frame).toContain("• fast")
  expect(frame).toContain("• cheap")
  const header = frame.split("\n").find((row) => row.includes("README.md") && row.includes("+5"))
  expect(header).toContain("rendered")
  // The other file keeps its diff.
  expect(frame).toContain('return "hex"')
})

test("the cursor stays on its source line across gR, both ways", async () => {
  const { gR, keys, lineOf, cursorRow } = await renderedApp()
  keys.jumpTo(lineOf("## Shipping"))

  await gR()
  expect(cursorRow()).toMatchObject({ content: "Shipping", newLineNum: 5, rendered: true })

  await gR()
  expect(cursorRow()).toMatchObject({ content: "## Shipping", newLineNum: 5, type: "addition" })
})

test("j walks the rendered rows", async () => {
  const { gR, keys, type, lineOf, cursorRow } = await renderedApp()
  keys.jumpTo(lineOf("## Shipping"))
  await gR()
  type("j", "j")
  expect(cursorRow()).toMatchObject({ content: "• fast", newLineNum: 7 })
})

test("/ finds a rendered row by its rendered text", async () => {
  const { mounted, gR, keys, type, lineOf, vim } = await renderedApp()
  keys.jumpTo(lineOf("# shop"))
  await gR()
  type("/")
  await mounted.setup.mockInput.typeText("Shipping")
  expect(mounted.ctx.getSearchState().matches.map((match) => match.line)).toEqual([lineOf("Shipping")])
  mounted.setup.mockInput.pressEnter()
  await Bun.sleep(0)
  expect(vim().line).toBe(lineOf("Shipping"))
})

test("a second gR brings back the diff's rows", async () => {
  const { mounted, gR, keys, lineOf } = await renderedApp()
  keys.jumpTo(lineOf("## Shipping"))
  await gR()
  await gR()
  const frame = await mounted.frame()
  expect(frame).toContain("## Shipping")
  expect(frame).toContain("- fast")
  expect(frame).not.toContain("•")
  expect(frame).not.toContain("rendered")
})

test("gR on the .ts file says it renders markdown only, and changes nothing", async () => {
  const { mounted, gR, keys, lines, lineOf } = await renderedApp()
  keys.jumpTo(lineOf('  return "hex"', "src/a.ts"))
  const before = lines().map((line) => line.content)
  await gR()
  expect(mounted.toast.current()?.message).toBe("gR renders markdown files only")
  expect(mounted.renderedMarkdown.files().size).toBe(0)
  expect(lines().map((line) => line.content)).toEqual(before)
})

test("with the README not loaded yet, gR loads it and draws it rendered once it lands", async () => {
  const loads: string[] = []
  let land = () => {}
  const { mounted, gR, keys, lineOf, cursorRow } = await renderedApp({
    loaded: false,
    more: {
      loadFileContent: (filename) => {
        loads.push(filename)
        return new Promise<void>((resolve) => {
          land = () => {
            mounted.fileContent.set(filename, README, "# shop\n\nIntro")
            mounted.render()
            resolve()
          }
        })
      },
    },
  })
  keys.jumpTo(lineOf("## Shipping"))
  await gR()
  expect(loads).toEqual(["README.md"])
  expect(await mounted.frame()).toContain("## Shipping")

  land()
  await Bun.sleep(0)
  const frame = await mounted.frame()
  expect(frame).not.toContain("## Shipping")
  expect(frame).toContain("• fast")
  expect(cursorRow()).toMatchObject({ content: "Shipping", newLineNum: 5 })
})

test("after gr the README is still drawn rendered, and one gR brings its diff back", async () => {
  const loads: string[] = []
  let mounted!: Awaited<ReturnType<typeof mountApp>>
  const app = await renderedApp({
    more: {
      // handleRefresh's swap, then its reread of the rendered files' new versions.
      refreshContext: {
        handleRefresh: async () => {
          adoptReloadedState(reloadCtx(mounted), (prev) => ({
            ...createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"),
            focusedPanel: "diff",
          }))
          await reloadRenderedFiles({
            files: () => mounted.ctx.getState().files,
            renderedMarkdown: mounted.renderedMarkdown,
            fileContent: mounted.fileContent,
            loadFileContent: async (filename) => {
              loads.push(filename)
              mounted.fileContent.set(filename, README, "# shop\n\nIntro")
            },
          })
          mounted.show({ files: mounted.ctx.getState().files })
        },
      },
    },
  })
  mounted = app.mounted
  const { gR, keys, type, lineOf } = app
  keys.jumpTo(lineOf("## Shipping"))
  await gR()
  expect(await mounted.frame()).toContain("• fast")

  type("g", "r")
  await Bun.sleep(0)
  expect(mounted.ctx.getState().description).toBe("reloaded")
  expect(loads).toEqual(["README.md"])
  const reloaded = await mounted.frame()
  expect(reloaded).not.toContain("## Shipping")
  expect(reloaded).toContain("• fast")
  expect(reloaded.split("\n").find((row) => row.includes("README.md") && row.includes("+5"))).toContain("rendered")

  keys.jumpTo(lineOf("Shipping"))
  await gR()
  const back = await mounted.frame()
  expect(back).toContain("## Shipping")
  expect(back).not.toContain("rendered")
})
