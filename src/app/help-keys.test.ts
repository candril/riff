import { test, expect } from "bun:test"
import { parseKeypress } from "@opentui/core"
import { createHelpState } from "../features/help/state"
import { createSyncPreviewState } from "../features/sync-preview/state"
import { helpViewport } from "../components/help-sections"
import { helpOverlayModel } from "../components/help-overlay-model"
import { registerSyncPreviewKeys } from "../features/sync-preview/keys"
import { keymapHarness } from "../testing/keymap-keys"
import { registerHelpKeys } from "./help-keys"

const ESC = "\x1b"
const DOWN = "\x1b[B"
const UP = "\x1b[A"
const CTRL_D = "\x1b[100;5u"
const CTRL_U = "\x1b[117;5u"
const CTRL_B = "\x1b[98;5u"
const CTRL_X = "\x1b[120;5u"
const CTRL_G = "\x1b[103;5u"
const CTRL_J = "\x1b[106;5u"
const META_G = "\x1b[103;3u"
const SUPER_J = "\x1b[106;9u"
const HYPER_J = "\x1b[106;17u"

const parse = (sequence: string) => parseKeypress(sequence, { useKittyKeyboard: true })!

async function openHelp(rows: number, { syncPreview = false } = {}) {
  let chordPending = false
  const { riffKeymap, leftKeys, press } = await keymapHarness()
  const helpState = createHelpState()
  helpState.toggle()
  const syncPreviewState = createSyncPreviewState()
  if (syncPreview) syncPreviewState.show()
  let renders = 0
  let height = rows
  const render = () => {
    renders++
  }
  registerHelpKeys(riffKeymap, { help: helpState, render, height: () => height, chordPending: () => chordPending })
  registerSyncPreviewKeys(riffKeymap, { syncPreview: syncPreviewState, render, onExecuteSync: () => {} })
  return {
    press,
    leftKeys,
    syncPreviewOpen: syncPreviewState.open,
    open: helpState.open,
    scroll: helpState.scroll,
    toggle: helpState.toggle,
    renders: () => renders,
    resize: (rows: number) => void (height = rows),
    holdChord: () => void (chordPending = true),
  }
}

test("j and k scroll the help a row at a time, and k stops at the top", async () => {
  const help = await openHelp(40)
  help.press("j")
  expect(help.scroll()).toBe(1)
  help.press("k")
  expect(help.scroll()).toBe(0)
  help.press("k")
  expect(help.scroll()).toBe(0)
  help.press(DOWN)
  help.press(UP)
  help.press(DOWN)
  expect(help.scroll()).toBe(1)
  expect(help.renders()).toBe(6)
  expect(help.leftKeys).toEqual([])
})

test("Ctrl-d jumps half the window and stops at the end; Ctrl-u comes back", async () => {
  const { rows, maxScroll } = helpViewport(40)
  const help = await openHelp(40)
  help.press(CTRL_D)
  expect(help.scroll()).toBe(Math.min(maxScroll, Math.floor(rows / 2)))
  for (let i = 0; i < 5; i++) help.press(CTRL_D)
  expect(help.scroll()).toBe(maxScroll)
  for (let i = 0; i < 40; i++) help.press("j")
  expect(help.scroll()).toBe(maxScroll)
  help.press("k")
  expect(help.scroll()).toBe(maxScroll - 1)
  for (let i = 0; i < 5; i++) help.press(CTRL_U)
  expect(help.scroll()).toBe(0)
  expect(help.leftKeys).toEqual([])
})

test("where every key fits, scrolling keys leave the help where it is", async () => {
  const help = await openHelp(70)
  help.press("j")
  help.press(CTRL_D)
  expect(help.scroll()).toBe(0)
})

test("Esc closes the help, and opening it again starts at the top", async () => {
  const help = await openHelp(40)
  help.press("j")
  help.press("j")
  help.press(ESC)
  expect(help.open()).toBe(false)
  help.toggle()
  expect([help.open(), help.scroll()]).toEqual([true, 0])
  expect(help.renders()).toBe(3)
  expect(help.leftKeys).toEqual([])
})

test("q closes the help too", async () => {
  const help = await openHelp(40)
  help.press("q")
  expect(help.open()).toBe(false)
  expect(help.renders()).toBe(1)
  expect(help.leftKeys).toEqual([])
})

test("every other key is swallowed and changes nothing", async () => {
  const help = await openHelp(40)
  help.press("x")
  help.press(CTRL_X)
  help.press(CTRL_B)
  expect([help.open(), help.scroll()]).toEqual([true, 0])
  expect(help.renders()).toBe(0)
  expect(help.leftKeys).toEqual([])
})

test("a bare g, or one with meta held, reaches the keymap's g sequences for g?; Ctrl-g and G do not", async () => {
  expect(parse(META_G)).toMatchObject({ name: "g", meta: true })
  expect(parse(CTRL_G)).toMatchObject({ name: "g", ctrl: true })
  expect(parse("G")).toMatchObject({ name: "g", shift: true })
  const help = await openHelp(40)
  help.press("g")
  help.press(META_G)
  help.press(CTRL_G)
  help.press("G")
  expect(help.leftKeys).toEqual(["g", "g"])
  expect([help.open(), help.scroll()]).toEqual([true, 0])
})

test("while the chain holds a chord the help stands aside, so q and ? reach the chain", async () => {
  const help = await openHelp(40)
  help.holdChord()
  help.press("q")
  help.press("?")
  expect(help.leftKeys).toEqual(["q", "?"])
  expect(help.open()).toBe(true)
})

test("super+j and hyper+j scroll the help, and Ctrl-j does not", async () => {
  expect(parse(SUPER_J)).toMatchObject({ name: "j", super: true })
  expect(parse(HYPER_J)).toMatchObject({ name: "j", hyper: true })
  expect(parse(CTRL_J)).toMatchObject({ name: "j", ctrl: true })
  const help = await openHelp(40)
  help.press(SUPER_J)
  help.press(HYPER_J)
  help.press(CTRL_J)
  expect(help.scroll()).toBe(2)
  expect(help.leftKeys).toEqual([])
})

test("with the help and the sync preview both up, escape closes the sync preview, not the help", async () => {
  const help = await openHelp(40, { syncPreview: true })
  help.press(ESC)
  expect(help.syncPreviewOpen()).toBe(false)
  expect(help.open()).toBe(true)
  expect(help.leftKeys).toEqual([])
})

test("under the sync preview the help scrolls and closes on none of its keys", async () => {
  const help = await openHelp(40, { syncPreview: true })
  help.press("j")
  help.press(CTRL_D)
  help.press("q")
  expect([help.open(), help.scroll()]).toEqual([true, 0])
  expect(help.syncPreviewOpen()).toBe(true)
  expect(help.leftKeys).toEqual([])
})

test("after the terminal grows, the first k moves the help up from where it is drawn", async () => {
  const short = 30
  const tall = 45
  expect(helpViewport(tall).maxScroll).toBeGreaterThan(0)
  expect(helpViewport(tall).maxScroll).toBeLessThan(helpViewport(short).maxScroll)
  const help = await openHelp(short)
  for (let i = 0; i < 80; i++) help.press("j")
  const before = helpOverlayModel(undefined, help.scroll(), tall).scroll
  help.resize(tall)
  help.press("k")
  expect(helpOverlayModel(undefined, help.scroll(), tall).scroll).toBe(before - 1)
})
