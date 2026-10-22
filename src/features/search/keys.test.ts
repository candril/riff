import { describe, expect, test } from "bun:test"
import { diffState, promptKeys } from "../../testing/prompt-keys"

const ESC = "\x1b"
const ENTER = "\r"
const CTRL_W = "\x17"
const CTRL_R = "\x12"

describe("the search prompt", () => {
  test("Esc cancels and Enter confirms, both prevented so the field never sees them", async () => {
    const keys = await promptKeys(diffState())
    keys.setSearchActive(true)
    expect(keys.press(ESC).defaultPrevented).toBe(true)
    expect(keys.press(ENTER).defaultPrevented).toBe(true)
    expect(keys.press(ENTER, "enter").defaultPrevented).toBe(true)
    expect(keys.calls).toEqual(["cancelSearch", "confirmSearch", "confirmSearch"])
    expect(keys.leftKeys).toEqual([])
  })

  test("every other key is held from the chain and left to the field", async () => {
    const keys = await promptKeys(diffState())
    keys.setSearchActive(true)
    for (const sequence of ["q", "g", "i", CTRL_W, CTRL_R]) expect(keys.press(sequence).defaultPrevented).toBe(false)
    expect(keys.calls).toEqual([])
    expect(keys.leftKeys).toEqual([])
  })

  test("drops a pending mark chord the key gives way to, as the chain did first", async () => {
    const keys = await promptKeys(diffState())
    keys.setSearchActive(true)
    keys.setChord("m")
    keys.press(ESC)
    expect(keys.chord()).toBeNull()
  })

  test("closed, it holds nothing", async () => {
    const keys = await promptKeys(diffState())
    keys.press("q")
    keys.press(ESC)
    expect(keys.calls).toEqual([])
    expect(keys.leftKeys).toEqual(["q", "escape"])
  })
})
