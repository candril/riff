import { describe, test, expect } from "bun:test"
import { parseKeypress } from "@opentui/core"
import {
  createInitialState,
  openActionMenu,
  openCommentsPicker,
  openFilePicker,
  openOccurrencePicker,
  setCommentsPickerQuery,
  setFilePickerQuery,
  type AppState,
} from "../state"
import { parseDiff, sortFiles } from "../utils/diff-parser"
import { buildFileTree } from "../utils/file-tree"
import { createCursorState } from "../vim-diff/cursor-state"
import type { Comment } from "../types"
import { keymapHarness } from "../testing/keymap-keys"
import { registerFilePickerKeys } from "../features/file-picker"
import { registerCommentsPickerKeys } from "../features/comments-picker"
import { openMarksPicker, registerMarksPickerKeys, setMarksPickerQuery, type Mark } from "../features/marks"
import { registerOccurrencePickerKeys } from "../features/occurrence-picker"
import { registerPickerKeys } from "./picker-keys"
import { registerModalKeys } from "./keys"
import type { GlobalKeyContext } from "./global-keys"

const NAMES = ["a.ts", "b.ts", "c.ts"]
const diffOf = (name: string) => `diff --git a/${name} b/${name}
--- a/${name}
+++ b/${name}
@@ -1,1 +1,1 @@
-old
+const hit = 1
`
const FILES = sortFiles(parseDiff(NAMES.map(diffOf).join("")))
const comment = (id: string, filename: string): Comment => ({
  id,
  filename,
  line: 1,
  side: "RIGHT",
  body: `about ${filename}`,
  createdAt: "2026-01-01T00:00:00Z",
  status: "local",
})
const mark = (letter: string, filename: string): Mark => ({ letter, filename, line: 1, side: "RIGHT" })

function closed(): AppState {
  const base = createInitialState(FILES, buildFileTree(FILES), "local", "local changes")
  return {
    ...base,
    comments: NAMES.map((name, at) => comment(`c${at}`, name)),
    marks: { marks: NAMES.map((name) => mark(name[0]!, name)), current: null, previous: null },
  }
}

const NO_MATCH = "zzz"

interface PickerCase {
  name: string
  open: (s: AppState) => AppState
  openEmpty: (s: AppState) => AppState
  isOpen: (s: AppState) => boolean
  index: (s: AppState) => number
  wraps: boolean
  /** What picking the second row records. */
  picked: string
  emptyEnterCloses: boolean
}

const PICKERS: PickerCase[] = [
  {
    name: "file picker",
    open: openFilePicker,
    openEmpty: (s) => setFilePickerQuery(openFilePicker(s), NO_MATCH),
    isOpen: (s) => s.filePicker.open,
    index: (s) => s.filePicker.selectedIndex,
    wraps: true,
    picked: "reveal 1",
    emptyEnterCloses: false,
  },
  {
    name: "comments picker",
    open: openCommentsPicker,
    openEmpty: (s) => setCommentsPickerQuery(openCommentsPicker(s), NO_MATCH),
    isOpen: (s) => s.commentsPicker.open,
    index: (s) => s.commentsPicker.selectedIndex,
    wraps: true,
    picked: "comment c1",
    emptyEnterCloses: false,
  },
  {
    name: "marks picker",
    open: openMarksPicker,
    openEmpty: (s) => setMarksPickerQuery(openMarksPicker(s), NO_MATCH),
    isOpen: (s) => s.marksPicker.open,
    index: (s) => s.marksPicker.selectedIndex,
    wraps: false,
    picked: "jump b",
    emptyEnterCloses: true,
  },
  {
    name: "occurrence picker",
    open: (s) => openOccurrencePicker(s, "hit"),
    openEmpty: (s) => openOccurrencePicker(s, NO_MATCH),
    isOpen: (s) => s.occurrencePicker.open,
    index: (s) => s.occurrencePicker.selectedIndex,
    wraps: true,
    picked: "hit b.ts",
    emptyEnterCloses: false,
  },
]

/** The four layers on recording deps, in registerPickerKeys' order. */
async function setup(initial: AppState) {
  const harness = await keymapHarness()
  let state = initial
  const calls: string[] = []
  const base = {
    getState: () => state,
    setState: (update: (s: AppState) => AppState) => {
      state = update(state)
    },
    render: () => void calls.push("render"),
  }
  registerOccurrencePickerKeys(harness.riffKeymap, {
    ...base,
    onSelectHit: (hit) => void calls.push(`hit ${hit.row.filename}`),
  })
  registerMarksPickerKeys(harness.riffKeymap, {
    ...base,
    onJump: (letter) => void calls.push(`jump ${letter}`),
    save: () => void calls.push("save"),
  })
  registerCommentsPickerKeys(harness.riffKeymap, {
    ...base,
    onSelectComment: (picked) => void calls.push(`comment ${picked.id}`),
  })
  registerFilePickerKeys(harness.riffKeymap, {
    ...base,
    onFileSelected: () => void calls.push("file selected"),
    revealFile: (index) => void calls.push(`reveal ${index}`),
  })
  return { ...harness, calls, state: () => state }
}

const ESC = "\x1b"
const SHIFT_ESC = "\x1b[27;2u"
const ALT_ESC = "\x1b\x1b"
const UP = "\x1b[A"
const DOWN = "\x1b[B"
const CTRL_P = "\x10"
const CTRL_N = "\x0e"
const BACKSPACE = "\x7f"
const CTRL_X = "\x18"
const CTRL_G = "\x07"

test("the sequences below parse as the keys they stand for", () => {
  const parse = (sequence: string) => parseKeypress(sequence, { useKittyKeyboard: true })
  expect(parse(SHIFT_ESC)).toMatchObject({ name: "escape", shift: true })
  expect(parse(ALT_ESC)).toMatchObject({ name: "escape", meta: true })
  expect(parse(CTRL_P)).toMatchObject({ name: "p", ctrl: true })
  expect(parse(CTRL_N)).toMatchObject({ name: "n", ctrl: true })
  expect(parse(BACKSPACE)).toMatchObject({ name: "backspace" })
  expect(parse(CTRL_X)).toMatchObject({ name: "x", ctrl: true })
  expect(parse(CTRL_G)).toMatchObject({ name: "g", ctrl: true })
})

for (const picker of PICKERS) {
  describe(`the ${picker.name}`, () => {
    test("escape closes it, with shift or alt held too", async () => {
      for (const sequence of [ESC, SHIFT_ESC, ALT_ESC]) {
        const { state, legacyKeys, press } = await setup(picker.open(closed()))
        expect(press(sequence).defaultPrevented).toBe(true)
        expect(picker.isOpen(state())).toBe(false)
        expect(legacyKeys).toEqual([])
      }
    })

    test("return and a key named enter both pick the selected row", async () => {
      for (const rename of [undefined, "enter"]) {
        const { state, calls, legacyKeys, press } = await setup(picker.open(closed()))
        press(DOWN)
        calls.length = 0
        expect(press("\r", rename).defaultPrevented).toBe(true)
        expect(calls).toContain(picker.picked)
        expect(picker.isOpen(state())).toBe(false)
        expect(legacyKeys).toEqual([])
      }
    })

    test("the arrows, ctrl+p and ctrl+n move the selection within the list", async () => {
      const { state, legacyKeys, press } = await setup(picker.open(closed()))
      const at = (sequence: string) => {
        expect(press(sequence).defaultPrevented).toBe(true)
        return picker.index(state())
      }
      expect(at(DOWN)).toBe(1)
      expect(at(CTRL_N)).toBe(2)
      expect(at(DOWN)).toBe(picker.wraps ? 0 : 2)
      expect(at(UP)).toBe(picker.wraps ? 2 : 1)
      expect(at(CTRL_P)).toBe(picker.wraps ? 1 : 0)
      expect(at(CTRL_P)).toBe(0)
      expect(legacyKeys).toEqual([])
    })

    test("a bare p, n or any other key is left for the field and kept from the chain", async () => {
      const { state, calls, legacyKeys, press } = await setup(picker.open(closed()))
      for (const sequence of ["p", "n", "x", "g", "j", BACKSPACE]) {
        expect(press(sequence).defaultPrevented).toBe(false)
      }
      expect(picker.isOpen(state())).toBe(true)
      expect(picker.index(state())).toBe(0)
      expect(calls).toEqual([])
      expect(legacyKeys).toEqual([])
    })

    test("enter on an empty list is prevented and picks nothing", async () => {
      const { state, calls, legacyKeys, press } = await setup(picker.openEmpty(closed()))
      expect(press("\r").defaultPrevented).toBe(true)
      expect(calls).toEqual(picker.emptyEnterCloses ? ["render"] : [])
      expect(picker.isOpen(state())).toBe(!picker.emptyEnterCloses)
      expect(legacyKeys).toEqual([])
    })
  })
}

test("ctrl+g in the occurrence picker switches the prompt to the filter and back, and a bare g is typing", async () => {
  const { state, calls, legacyKeys, press } = await setup(openOccurrencePicker(closed(), "hit"))

  expect(press(CTRL_G).defaultPrevented).toBe(true)
  expect(state().occurrencePicker.narrowing).toBe(true)
  expect(press("g").defaultPrevented).toBe(false)
  expect(state().occurrencePicker.narrowing).toBe(true)
  press(CTRL_G)

  expect(state().occurrencePicker.narrowing).toBe(false)
  expect(calls).toEqual(["render", "render"])
  expect(legacyKeys).toEqual([])
})

test("ctrl+x and ctrl+g are left for the field in the pickers that do not bind them", async () => {
  const { state, calls, legacyKeys, press } = await setup(openCommentsPicker(openFilePicker(closed())))

  expect(press(CTRL_X).defaultPrevented).toBe(false)
  expect(press(CTRL_G).defaultPrevented).toBe(false)

  expect(state().filePicker.open).toBe(true)
  expect(calls).toEqual([])
  expect(legacyKeys).toEqual([])
})

test("with every picker closed their keys reach the chain", async () => {
  const { legacyKeys, press } = await setup(closed())
  for (const sequence of [ESC, "\r", UP, DOWN, CTRL_P, CTRL_N, "p", "x", CTRL_X, CTRL_G]) press(sequence)
  press("\r", "enter")
  expect(legacyKeys).toEqual(["escape", "return", "up", "down", "p", "n", "p", "x", "x", "g", "enter"])
})

/** registerPickerKeys and registerModalKeys in createAppKeys' order, on a context only Esc needs. */
async function setupApp(initial: AppState) {
  const harness = await keymapHarness()
  let state = initial
  const ctx = {
    getState: () => state,
    setState: (update: (s: AppState) => AppState) => {
      state = update(state)
    },
    render: () => {},
  }
  registerPickerKeys(harness.riffKeymap, ctx as GlobalKeyContext)
  registerModalKeys(harness.riffKeymap, {
    ...ctx,
    getVimState: () => createCursorState(),
    executeAction: () => {},
    onToggleReaction: () => {},
    onLink: () => {},
    getFlashState: () => ({ active: false }) as never,
    flashHandler: () => ({}) as never,
  })
  return { ...harness, state: () => state }
}

test("with the palette open over a picker escape closes the palette", async () => {
  const { state, legacyKeys, press } = await setupApp(openActionMenu(openFilePicker(closed())))

  press(ESC)

  expect(state().actionMenu.open).toBe(false)
  expect(state().filePicker.open).toBe(true)
  expect(legacyKeys).toEqual([])
})

test("with the file and comments pickers both open escape closes the file picker", async () => {
  const { state, press } = await setupApp(openCommentsPicker(openFilePicker(closed())))

  press(ESC)

  expect(state().filePicker.open).toBe(false)
  expect(state().commentsPicker.open).toBe(true)
})

test("with the marks and occurrence pickers both open escape closes the marks picker", async () => {
  const { state, press } = await setupApp(openMarksPicker(openOccurrencePicker(closed(), "hit")))

  press(ESC)

  expect(state().marksPicker.open).toBe(false)
  expect(state().occurrencePicker.open).toBe(true)
})
