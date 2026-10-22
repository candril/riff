import { test, expect } from "bun:test"
import { parseKeypress } from "@opentui/core"
import { createInitialState, toggleHelp, type AppState } from "../state"
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
  let chainChordPending = false
  const { riffKeymap, legacyKeys, press } = await keymapHarness({ chordPending: () => chainChordPending })
  const initial = toggleHelp(createInitialState([], [], "", ""))
  let state: AppState = { ...initial, syncPreview: { ...initial.syncPreview, open: syncPreview } }
  let renders = 0
  let height = rows
  const deps = {
    getState: () => state,
    setState: (update: (s: AppState) => AppState) => {
      state = update(state)
    },
    render: () => {
      renders++
    },
  }
  registerHelpKeys(riffKeymap, { ...deps, height: () => height, chainChordPending: () => chainChordPending })
  registerSyncPreviewKeys(riffKeymap, { ...deps, onExecuteSync: () => {} })
  return {
    press,
    legacyKeys,
    state: () => state,
    renders: () => renders,
    resize: (rows: number) => void (height = rows),
    holdChainChord: () => void (chainChordPending = true),
  }
}

test("j and k scroll the help a row at a time, and k stops at the top", async () => {
  const help = await openHelp(40)
  help.press("j")
  expect(help.state().helpScroll).toBe(1)
  help.press("k")
  expect(help.state().helpScroll).toBe(0)
  help.press("k")
  expect(help.state().helpScroll).toBe(0)
  help.press(DOWN)
  help.press(UP)
  help.press(DOWN)
  expect(help.state().helpScroll).toBe(1)
  expect(help.renders()).toBe(6)
  expect(help.legacyKeys).toEqual([])
})

test("Ctrl-d jumps half the window and stops at the end; Ctrl-u comes back", async () => {
  const { rows, maxScroll } = helpViewport(40)
  const help = await openHelp(40)
  help.press(CTRL_D)
  expect(help.state().helpScroll).toBe(Math.min(maxScroll, Math.floor(rows / 2)))
  for (let i = 0; i < 5; i++) help.press(CTRL_D)
  expect(help.state().helpScroll).toBe(maxScroll)
  for (let i = 0; i < 40; i++) help.press("j")
  expect(help.state().helpScroll).toBe(maxScroll)
  help.press("k")
  expect(help.state().helpScroll).toBe(maxScroll - 1)
  for (let i = 0; i < 5; i++) help.press(CTRL_U)
  expect(help.state().helpScroll).toBe(0)
  expect(help.legacyKeys).toEqual([])
})

test("where every key fits, scrolling keys leave the help where it is", async () => {
  const help = await openHelp(70)
  help.press("j")
  help.press(CTRL_D)
  expect(help.state().helpScroll).toBe(0)
})

test("Esc closes the help, and opening it again starts at the top", async () => {
  const help = await openHelp(40)
  help.press("j")
  help.press("j")
  help.press(ESC)
  expect(help.state().showHelp).toBe(false)
  expect(toggleHelp(help.state()).helpScroll).toBe(0)
  expect(help.renders()).toBe(3)
  expect(help.legacyKeys).toEqual([])
})

test("q closes the help too", async () => {
  const help = await openHelp(40)
  help.press("q")
  expect(help.state().showHelp).toBe(false)
  expect(help.renders()).toBe(1)
  expect(help.legacyKeys).toEqual([])
})

test("every other key is swallowed and changes nothing", async () => {
  const help = await openHelp(40)
  help.press("x")
  help.press(CTRL_X)
  help.press(CTRL_B)
  expect(help.state()).toMatchObject({ showHelp: true, helpScroll: 0 })
  expect(help.renders()).toBe(0)
  expect(help.legacyKeys).toEqual([])
})

test("a bare g, or one with meta held, reaches the chain's chord matcher for g?; Ctrl-g and G do not", async () => {
  expect(parse(META_G)).toMatchObject({ name: "g", meta: true })
  expect(parse(CTRL_G)).toMatchObject({ name: "g", ctrl: true })
  expect(parse("G")).toMatchObject({ name: "g", shift: true })
  const help = await openHelp(40)
  help.press("g")
  help.press(META_G)
  help.press(CTRL_G)
  help.press("G")
  expect(help.legacyKeys).toEqual(["g", "g"])
  expect(help.state()).toMatchObject({ showHelp: true, helpScroll: 0 })
})

test("while the chain holds a chord the help stands aside, so q and ? reach the chain", async () => {
  const help = await openHelp(40)
  help.holdChainChord()
  help.press("q")
  help.press("?")
  expect(help.legacyKeys).toEqual(["q", "?"])
  expect(help.state().showHelp).toBe(true)
})

test("super+j and hyper+j scroll the help, and Ctrl-j does not", async () => {
  expect(parse(SUPER_J)).toMatchObject({ name: "j", super: true })
  expect(parse(HYPER_J)).toMatchObject({ name: "j", hyper: true })
  expect(parse(CTRL_J)).toMatchObject({ name: "j", ctrl: true })
  const help = await openHelp(40)
  help.press(SUPER_J)
  help.press(HYPER_J)
  help.press(CTRL_J)
  expect(help.state().helpScroll).toBe(2)
  expect(help.legacyKeys).toEqual([])
})

test("with the help and the sync preview both up, escape closes the sync preview, not the help", async () => {
  const help = await openHelp(40, { syncPreview: true })
  help.press(ESC)
  expect(help.state().syncPreview.open).toBe(false)
  expect(help.state().showHelp).toBe(true)
  expect(help.legacyKeys).toEqual([])
})

test("under the sync preview the help scrolls and closes on none of its keys", async () => {
  const help = await openHelp(40, { syncPreview: true })
  help.press("j")
  help.press(CTRL_D)
  help.press("q")
  expect(help.state()).toMatchObject({ showHelp: true, helpScroll: 0 })
  expect(help.state().syncPreview.open).toBe(true)
  expect(help.legacyKeys).toEqual([])
})

test("after the terminal grows, the first k moves the help up from where it is drawn", async () => {
  const short = 30
  const tall = 45
  expect(helpViewport(tall).maxScroll).toBeGreaterThan(0)
  expect(helpViewport(tall).maxScroll).toBeLessThan(helpViewport(short).maxScroll)
  const help = await openHelp(short)
  for (let i = 0; i < 80; i++) help.press("j")
  const before = helpOverlayModel(undefined, help.state().helpScroll, tall).scroll
  help.resize(tall)
  help.press("k")
  expect(helpOverlayModel(undefined, help.state().helpScroll, tall).scroll).toBe(before - 1)
})
