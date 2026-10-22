import { describe, expect, test } from "bun:test"
import { diffState, promptKeys } from "../../testing/prompt-keys"
import type { AppState } from "../../state"

const ESC = "\x1b"
const ENTER = "\r"
const BACKSPACE = "\x7f"

const filtering = (treeFilter: string, patch: Partial<AppState> = {}) =>
  diffState({ showFilePanel: true, focusedPanel: "tree", treeFilterInput: true, treeFilter, ...patch })

describe("the tree's filter prompt", () => {
  test("Esc drops the filter and closes the prompt", async () => {
    const keys = await promptKeys(filtering("src"))
    expect(keys.press(ESC).defaultPrevented).toBe(true)
    expect(keys.state().treeFilterInput).toBe(false)
    expect(keys.state().treeFilter).toBe("")
    expect(keys.calls).toEqual(["updatePanel"])
    expect(keys.legacyKeys).toEqual([])
  })

  test("Enter keeps the filter and closes the prompt", async () => {
    for (const [sequence, name] of [[ENTER, undefined], [ENTER, "enter"]] as const) {
      const keys = await promptKeys(filtering("src"))
      expect(keys.press(sequence, name).defaultPrevented).toBe(true)
      expect(keys.state().treeFilterInput).toBe(false)
      expect(keys.state().treeFilter).toBe("src")
      expect(keys.legacyKeys).toEqual([])
    }
  })

  test("backspace on an empty query closes the prompt", async () => {
    const keys = await promptKeys(filtering(""))
    expect(keys.press(BACKSPACE).defaultPrevented).toBe(true)
    expect(keys.state().treeFilterInput).toBe(false)
    expect(keys.calls).toEqual(["updatePanel"])
  })

  test("backspace on a query, and every other key, is held from the chain and left to the field", async () => {
    const keys = await promptKeys(filtering("src"))
    for (const sequence of [BACKSPACE, "q", "i", "j"]) expect(keys.press(sequence).defaultPrevented).toBe(false)
    expect(keys.state().treeFilterInput).toBe(true)
    expect(keys.state().treeFilter).toBe("src")
    expect(keys.calls).toEqual([])
    expect(keys.legacyKeys).toEqual([])
  })

  test("with focus on the diff, or the tree hidden, it holds nothing", async () => {
    for (const patch of [{ focusedPanel: "diff" as const }, { showFilePanel: false }]) {
      const keys = await promptKeys(filtering("src", patch))
      keys.press("q")
      keys.press(ESC)
      expect(keys.state().treeFilterInput).toBe(true)
      expect(keys.legacyKeys).toEqual(["q", "escape"])
    }
  })
})
