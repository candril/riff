import { afterEach, describe, expect, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { actions } from "../actions/registry"
import { actionKeys } from "../actions/types"
import type { BlameDeps } from "../features/blame/keys"
import type { BlameSide } from "../providers/blame/sides"
import type { AppKeyContext } from "./key-context"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { prInfo } from "../testing/pr-info"

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

// The three ways a terminal reports shift+b: legacy "B" (b, shifted), kitty
// naming the uppercase letter (B, shifted) and kitty naming the base key (b, shifted).
const SHIFT_B = { legacy: "B", kittyUpper: "\x1b[66;2u", kittyBase: "\x1b[98;2u" } as const

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  const done = app
  app = null
  await done?.dispose()
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Every blame read the keys ask for, recorded and never answered; every action dispatched, recorded. */
async function mount(show: Parameters<NonNullable<typeof app>["show"]>[0] = {}) {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  app.show({ focusedPanel: "diff", ...show })
  await app.frame()
  const fileReads: [string, BlameSide][] = []
  const lineReads: [string, BlameSide, number][] = []
  const opened: string[] = []
  const dispatched: string[] = []
  const blame: BlameDeps = {
    source: {
      fileBlame(path, side) {
        fileReads.push([path, side])
        return new Promise(() => {})
      },
      lineBlame(path, side, line) {
        lineReads.push([path, side, line])
        return new Promise(() => {})
      },
    },
    openUrl: (url) => void opened.push(url),
    copy: async () => ({ ok: true }),
    repoRef: async () => ({ owner: "o", repo: "r" }),
    splitRows: () => app!.ctx.split.splitRows(),
  }
  const mounted = app
  const keys = keysOn(app, {
    blame,
    executeAction: ((id: string) => void dispatched.push(id)) as AppKeyContext["executeAction"],
    render: () => app === mounted && mounted.render(),
  })
  const press = (sequence: string) =>
    mounted.setup.renderer.keyInput.emit("keypress", new KeyEvent(parseKeypress(sequence, { useKittyKeyboard: true })!))
  const type = (...sequences: string[]) => sequences.forEach(press)
  const lineOf = (content: string) => mounted.ctx.getLineMapping().allLines.findIndex((line) => line.content === content)
  const column = () => mounted.blameColumns.columns().get("src/greet.ts")
  return { mounted, keys, type, lineOf, column, fileReads, lineReads, opened, dispatched }
}

describe("gb", () => {
  test("toggles the file's blame column in the diff, on and off", async () => {
    const { keys, type, lineOf, column, fileReads, mounted } = await mount()
    keys.jumpTo(lineOf('  return "hello"'))
    type("g", "b")
    expect(fileReads).toEqual([
      ["src/greet.ts", "head"],
      ["src/greet.ts", "base"],
    ])
    expect(column()).toEqual({ status: "loading" })
    expect(mounted.blamePeek.open()).toBe(false)
    type("g", "b")
    expect(mounted.blameColumns.columns().size).toBe(0)
  })

  test("is the column's only key: zB, in every spelling, does nothing to it", async () => {
    const { keys, type, lineOf, column, mounted, fileReads } = await mount()
    const at = lineOf('  return "hello"')
    keys.jumpTo(at)
    for (const sequence of Object.values(SHIFT_B)) type("z", sequence)
    expect(fileReads).toEqual([])
    expect(mounted.blameColumns.columns().size).toBe(0)
    expect(keys.vimState().line).toBe(at)
    expect(keys.vimState().col).toBe(0)
    expect(keys.chordPending()).toBe(false)
    type("g", "b")
    expect(column()).toEqual({ status: "loading" })
    for (const sequence of Object.values(SHIFT_B)) type("z", sequence)
    expect(column()).toEqual({ status: "loading" })
    expect(keys.vimState().line).toBe(at)
  })

  for (const viewMode of ["feed", "state"] as const) {
    test(`outside the diff view (${viewMode}) toggles nothing and dispatches nothing`, async () => {
      const { type, fileReads, lineReads, dispatched, mounted, keys } = await mount({ appMode: "pr", prInfo: prInfo(""), viewMode })
      type("g", "b")
      expect(keys.chordPending()).toBe(false)
      expect(fileReads).toEqual([])
      expect(lineReads).toEqual([])
      expect(mounted.blameColumns.columns().size).toBe(0)
      expect(mounted.blamePeek.open()).toBe(false)
      expect(dispatched).toEqual([])
    })
  }
})

describe("gB", () => {
  for (const [spelling, sequence] of Object.entries(SHIFT_B)) {
    test(`reported as ${spelling} opens the blame peek, and the same spelling closes it`, async () => {
      const { keys, type, lineOf, lineReads, mounted, dispatched } = await mount()
      keys.jumpTo(lineOf('  return "hello"'))
      type("g", sequence)
      expect(lineReads).toEqual([["src/greet.ts", "head", 2]])
      expect(mounted.blamePeek.open()).toBe(true)
      expect(mounted.blameColumns.columns().size).toBe(0)
      type("g", sequence)
      expect(mounted.blamePeek.open()).toBe(false)
      expect(dispatched).toEqual([])
    })
  }

  test("opened in one spelling closes in the other", async () => {
    const { keys, type, lineOf, mounted } = await mount()
    keys.jumpTo(lineOf('  return "hello"'))
    type("g", SHIFT_B.kittyUpper)
    expect(mounted.blamePeek.open()).toBe(true)
    type("g", SHIFT_B.kittyBase)
    expect(mounted.blamePeek.open()).toBe(false)
    type("g", SHIFT_B.kittyBase)
    expect(mounted.blamePeek.open()).toBe(true)
    type("g", SHIFT_B.legacy)
    expect(mounted.blamePeek.open()).toBe(false)
  })

  test("in a PR's diff opens the peek and never dispatches riff board", async () => {
    const { keys, type, lineOf, mounted, dispatched, opened } = await mount({ appMode: "pr", prInfo: prInfo("") })
    keys.jumpTo(lineOf('  return "hello"'))
    for (const sequence of Object.values(SHIFT_B)) {
      type("g", sequence)
      expect(mounted.blamePeek.open()).toBe(true)
      type("q")
      expect(mounted.blamePeek.open()).toBe(false)
    }
    await flush()
    expect(dispatched).toEqual([])
    expect(opened).toEqual([])
  })

  test("in the PR overview opens nothing: no peek, no column, no riff board", async () => {
    const { type, mounted, dispatched, opened, lineReads, fileReads, keys } = await mount({
      appMode: "pr",
      prInfo: prInfo("A body"),
      viewMode: "state",
    })
    for (const sequence of Object.values(SHIFT_B)) type("g", sequence)
    type("g", "b")
    await flush()
    expect(keys.chordPending()).toBe(false)
    expect(dispatched).toEqual([])
    expect(opened).toEqual([])
    expect(lineReads).toEqual([])
    expect(fileReads).toEqual([])
    expect(mounted.blamePeek.open()).toBe(false)
    expect(mounted.blameColumns.columns().size).toBe(0)
    expect(mounted.ctx.getState().viewMode).toBe("state")
  })
})

describe("under the blame peek", () => {
  test("gb, zB and zb leave the column off and the peek up", async () => {
    const { keys, type, lineOf, mounted, fileReads } = await mount()
    keys.jumpTo(lineOf('  return "hello"'))
    type("g", SHIFT_B.kittyBase)
    expect(mounted.blamePeek.open()).toBe(true)
    type("g", "b", "z", SHIFT_B.kittyUpper, "z", SHIFT_B.legacy, "z", "b")
    expect(fileReads).toEqual([])
    expect(mounted.blameColumns.columns().size).toBe(0)
    expect(mounted.blamePeek.open()).toBe(true)
    expect(keys.chordPending()).toBe(false)
    expect(await mounted.frame()).toContain("Reading blame…")
  })

  test("Esc closes it, after which gb toggles the column again", async () => {
    const { keys, type, lineOf, mounted, column } = await mount()
    keys.jumpTo(lineOf('  return "hello"'))
    type("g", SHIFT_B.kittyUpper)
    mounted.setup.mockInput.pressEscape()
    await Bun.sleep(50)
    expect(mounted.blamePeek.open()).toBe(false)
    type("g", "b")
    expect(column()).toEqual({ status: "loading" })
  })
})

describe("Open in riff board", () => {
  test("has no command and no shortcut, so the palette spells no key for it", async () => {
    const { keys } = await mount({ appMode: "pr", prInfo: prInfo("") })
    const board = actions.find((action) => action.id === "open-in-board")!
    expect(board.command).toBeUndefined()
    expect(board.shortcut).toBeUndefined()
    expect(actionKeys(board, keys.commandKeys)).toBeNull()
    const commands = keys.keymap.getCommands({ visibility: "registered" }).map((command) => command.name)
    expect(commands.filter((name) => /board/i.test(name))).toEqual([])
  })

  test("runs from the Ctrl+p palette, its row showing no shortcut", async () => {
    const { mounted, dispatched } = await mount({ appMode: "pr", prInfo: prInfo("") })
    const { mockInput } = mounted.setup
    mockInput.pressKey("p", { ctrl: true })
    expect(mounted.actionMenu.open()).toBe(true)
    // The row's right end is where a key would be drawn: Open in Browser's go is.
    await mockInput.typeText("open in browser")
    const browser = (await mounted.frame()).split("\n").find((line) => line.includes("Open in Browser"))!
    expect(browser.slice(browser.indexOf("Open in Browser") + "Open in Browser".length).trim()).toBe("go")
    for (let i = 0; i < "open in browser".length; i++) mockInput.pressBackspace()
    expect(mounted.actionMenu.query()).toBe("")
    await mockInput.typeText("riff board")
    const frame = await mounted.frame()
    const row = frame.split("\n").find((line) => line.includes("Open in riff board"))
    expect(row).toBeDefined()
    // Nothing but the label on the row: no gB, nor any other key, at its right end.
    expect(row!.slice(row!.indexOf("Open in riff board") + "Open in riff board".length).trim()).toBe("")
    mockInput.pressEnter()
    await flush()
    expect(dispatched).toEqual(["open-in-board"])
  })
})
