import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { keymapHarness } from "../../testing/keymap-keys"
import { registerSyncPreviewKeys } from "./keys"

const SEQUENCES: Record<string, string> = {
  return: "\r",
  escape: "\x1b",
  "shift+return": "\x1b[13;2u",
  "ctrl+escape": "\x1b[27;5u",
}

async function harness(syncPreview: Partial<AppState["syncPreview"]> = { open: true }) {
  const base = createInitialState([], [], "local", "local changes")
  let state: AppState = { ...base, syncPreview: { ...base.syncPreview, ...syncPreview } }
  let syncs = 0
  const { riffKeymap, legacyKeys, press: pressSequence } = await keymapHarness()
  registerSyncPreviewKeys(riffKeymap, {
    getState: () => state,
    setState: (fn) => {
      state = fn(state)
    },
    render: () => {},
    onExecuteSync: () => {
      syncs++
    },
  })
  /** Whether the preview kept the key from the chain, and whether it prevented it. */
  const press = (name: string, rename?: string) => {
    const before = legacyKeys.length
    const key = pressSequence(SEQUENCES[name] ?? name, rename)
    return { kept: legacyKeys.length === before, prevented: key.defaultPrevented }
  }
  return { press, state: () => state, syncs: () => syncs }
}

describe("the sync preview's keys", () => {
  test("do nothing while it is closed", async () => {
    const h = await harness({ open: false })
    expect(h.press("return")).toEqual({ kept: false, prevented: false })
    expect(h.syncs()).toBe(0)
  })

  test("Enter syncs, whatever is held, and so does a key named enter", async () => {
    const h = await harness()
    expect(h.press("return")).toEqual({ kept: true, prevented: true })
    h.press("shift+return")
    h.press("return", "enter")
    expect(h.syncs()).toBe(3)
  })

  test("Enter while a sync runs does nothing, and still takes the key", async () => {
    const h = await harness({ open: true, loading: true })
    expect(h.press("return")).toEqual({ kept: true, prevented: true })
    expect(h.syncs()).toBe(0)
  })

  test("Esc closes it, whatever is held", async () => {
    const h = await harness()
    expect(h.press("ctrl+escape")).toEqual({ kept: true, prevented: true })
    expect(h.state().syncPreview.open).toBe(false)
  })

  test("every other key is kept from the chain and left unprevented", async () => {
    const h = await harness()
    for (const name of ["j", "q", "s"]) expect(h.press(name)).toEqual({ kept: true, prevented: false })
    expect(h.state().syncPreview.open).toBe(true)
    expect(h.syncs()).toBe(0)
  })
})
