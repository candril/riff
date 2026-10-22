import { describe, expect, test } from "bun:test"
import { Z_SEQUENCES, zChordCommands, type ZChordDeps } from "./z-chord-commands"
import { createInitialState, type AppState } from "../state"

describe("Z_SEQUENCES", () => {
  test("maps both spellings of a shifted letter to one command", () => {
    for (const letter of ["a", "r", "m", "b", "l", "h"]) {
      const upper = Z_SEQUENCES[`z${letter.toUpperCase()}!` as keyof typeof Z_SEQUENCES]
      expect(upper).toBeDefined()
      expect(Z_SEQUENCES[`z${letter}!` as keyof typeof Z_SEQUENCES]).toBe(upper)
    }
  })

  test("leaves the unshifted letter its own command where the shift changes it", () => {
    expect(Z_SEQUENCES.za).not.toBe(Z_SEQUENCES["za!"])
    expect(Z_SEQUENCES.zb).not.toBe(Z_SEQUENCES["zb!"])
    expect(Z_SEQUENCES.zl).not.toBe(Z_SEQUENCES["zl!"])
  })
})

describe("za", () => {
  const folded = new Error("reached the folds")

  function za(viewMode: AppState["viewMode"]) {
    const ran: string[] = []
    const state = { ...createInitialState([], [], "test", ""), viewMode }
    const deps = {
      getState: () => state,
      toggleFeedRow: () => void ran.push("feed"),
      // The fold handlers need a whole app; reaching them at all is the fold toggle.
      foldsContext: new Proxy(
        {},
        {
          get: () => {
            ran.push("fold")
            throw folded
          },
        },
      ),
    } as unknown as ZChordDeps
    try {
      expect(zChordCommands(deps).toggleFold()).toBe(true)
    } catch (error) {
      if (error !== folded) throw error
    }
    return ran
  }

  test("opens the commit row in the feed", () => {
    expect(za("feed")).toEqual(["feed"])
  })

  test("toggles the fold at the cursor in the diff", () => {
    expect(za("diff")).toEqual(["fold"])
  })
})
