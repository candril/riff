import { afterEach, expect, test } from "bun:test"
import { jumpScenario, KEY, type JumpScenario } from "../testing/jump-scenarios"
import { executeAction, type ActionHandlers } from "../features/action-menu/execute"
import { paletteCommandRunner } from "./palette-commands"
import { fgAt, ints } from "../testing/frame"
import { colors } from "../theme"

const scenarios: JumpScenario[] = []
afterEach(async () => {
  await Promise.all(scenarios.splice(0).map((opened) => opened.dispose()))
})

/**
 * riff on three files with the palette wired as app.ts wires it: the
 * executor, the keymap's hints and the runner on the real keymap, with
 * app.ts's jump recording. None of these entries has a case of its own, so
 * a handler reached is an error.
 */
async function paletteApp() {
  const handlers = new Proxy({} as ActionHandlers, {
    get: (_target, name) => () => {
      throw new Error(`the palette reached handlers.${String(name)}`)
    },
  })
  const opened: JumpScenario = await jumpScenario({
    more: {
      executeAction: (id) => {
        const { mounted, keys, recording } = opened
        void executeAction(id, {
          state: mounted.ctx.getState(),
          setState: mounted.ctx.setState,
          render: mounted.render,
          filePicker: mounted.filePicker,
          commentsPicker: mounted.commentsPicker,
          occurrencePicker: mounted.occurrencePicker,
          marksPicker: mounted.marksPicker,
          handlers,
          commandKeys: keys.commandKeys,
          runCommand: paletteCommandRunner(keys.keymap, recording),
        })
      },
    },
  })
  scenarios.push(opened)
  return opened
}

/** Ctrl-p, the entry's name typed into the palette's field, and Enter. */
async function choose(opened: JumpScenario, query: string) {
  const { mockInput } = opened.mounted.setup
  mockInput.pressKey("p", { ctrl: true })
  await mockInput.typeText(query)
  mockInput.pressEnter()
  expect(opened.state().actionMenu.open).toBe(false)
  return opened.mounted.frame()
}

/** The diff without riff's header row, whose clock may tick between two apps. */
const body = (frame: string) => frame.split("\n").slice(1).join("\n")

/** The colour of a row's name in the tree: an unfocused tree names the file the cursor is in in the primary colour. */
function treeNameFg(opened: JumpScenario, name: string) {
  const rows = opened.mounted.setup.captureCharFrame().split("\n")
  const y = rows.findIndex((row) => row.includes(` ${name}`))
  return fgAt(opened.mounted.setup.captureSpans(), rows[y]!.indexOf(` ${name}`) + 1, y)
}

test("Next File moves the diff to the second file, as ]f does", async () => {
  const typed = await paletteApp()
  typed.press("]", "f")
  const byKey = await typed.mounted.frame()

  const opened = await paletteApp()
  await opened.mounted.frame()
  expect(treeNameFg(opened, "beta.ts")).not.toEqual(ints(colors.primary))
  const drawn = await choose(opened, "next file")
  expect(opened.where()).toEqual(typed.where())
  expect(opened.where().file).toBe("src/beta.ts")
  expect(treeNameFg(opened, "beta.ts")).toEqual(ints(colors.primary))
  expect(body(drawn)).toBe(body(byKey))
})

test("Jump Back after ]f walks back to the first file, and leaves the jumplist as Ctrl-o does", async () => {
  const typed = await paletteApp()
  typed.press("]", "f", KEY.ctrlO)
  const byKey = await typed.mounted.frame()

  const opened = await paletteApp()
  opened.press("]", "f")
  expect(opened.where().file).toBe("src/beta.ts")
  const drawn = await choose(opened, "jump back")
  expect(opened.where().file).toBe("src/alpha.ts")
  expect(treeNameFg(opened, "alpha.ts")).toEqual(ints(colors.primary))
  expect(opened.where()).toEqual(typed.where())
  expect(opened.list()).toEqual(typed.list())
  expect(body(drawn)).toBe(body(byKey))
})

test("Toggle Fold folds the file at the cursor away, as za does, and records no jump", async () => {
  const opened = await paletteApp()
  expect(await opened.mounted.frame()).toContain(`"src/alpha.ts line 2"`)

  const drawn = await choose(opened, "toggle fold")
  expect(drawn).not.toContain(`"src/alpha.ts line 2"`)
  expect(drawn).toContain(`"src/beta.ts line 1"`)
  expect(opened.list().entries).toEqual([])
})

test("Search in Diff from the tree draws the diff's search prompt rather than the tree's filter", async () => {
  const opened = await paletteApp()
  opened.mounted.show({ focusedPanel: "tree" })

  const drawn = await choose(opened, "search in diff")
  expect(opened.state().focusedPanel).toBe("diff")
  expect(opened.mounted.ctx.getSearchState().active).toBe(true)
  expect(drawn.split("\n").some((line) => line.trimStart() === "/")).toBe(true)
  expect(opened.state().treeFilterInput).toBe(false)
})

test("Visual Line Select starts a line selection, as V does", async () => {
  const opened = await paletteApp()
  expect(await opened.mounted.frame()).not.toContain("VISUAL LINE")

  expect(await choose(opened, "visual line select")).toContain("VISUAL LINE")
})

test("Focus File Tree moves focus to the tree, as Ctrl-h does, and its title lights up", async () => {
  const opened = await paletteApp()
  const titleFg = () => {
    const rows = opened.mounted.setup.captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("Files ("))
    return fgAt(opened.mounted.setup.captureSpans(), rows[y]!.indexOf("Files ("), y)
  }
  await opened.mounted.frame()
  expect(titleFg()).toEqual(ints(colors.textMuted))

  await choose(opened, "focus file tree")
  expect(opened.state().focusedPanel).toBe("tree")
  expect(titleFg()).toEqual(ints(colors.primary))
})
