import { describe, expect, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { keymapHarness } from "../testing/keymap-keys"
import { anyModifiers } from "./key-variants"
import { chordStrokeToken, chordSuffix, registerChordStrokes } from "./chord-stroke"

const key = (sequence: string) => new KeyEvent(parseKeypress(sequence, { useKittyKeyboard: true })!)

describe("chordSuffix", () => {
  test("is the key's name", () => {
    expect(chordSuffix(key("f"))).toBe("f")
  })

  test("falls back to a lone character the parser left unnamed", () => {
    expect(chordSuffix({ name: "", sequence: "\\", shift: false })).toBe("\\")
    expect(chordSuffix({ name: "", sequence: "ab", shift: false })).toBe("")
  })

  test("marks shift with a bang", () => {
    expect(chordSuffix({ name: "R", sequence: "R", shift: true })).toBe("R!")
  })

  test("ignores ctrl and meta", () => {
    expect(chordSuffix(key("\x06"))).toBe("f")
    expect(chordSuffix(key("\x1bf"))).toBe("f")
  })
})

test("a shifted suffix gets a token of its own, as token names fold to lower case", () => {
  expect(chordStrokeToken("r")).toBe("chord-r")
  expect(chordStrokeToken("R!")).toBe("chord-shift-r")
})

describe("a chord stroke in a keymap sequence", () => {
  async function bracketF(run: () => boolean = () => true) {
    const harness = await keymapHarness()
    const runs: string[] = []
    registerChordStrokes(harness.riffKeymap.keymap, ["f", "R!"])
    harness.riffKeymap.keymap.registerLayer({
      commands: [
        {
          name: "test.f",
          run: () => {
            runs.push("]f")
            return run()
          },
        },
        { name: "test.R", run: () => void runs.push("]R!") },
      ],
      bindings: [
        ...anyModifiers("]", "test.f").map((b) => ({ ...b, key: `${b.key}{${chordStrokeToken("f")}}` })),
        ...anyModifiers("]", "test.R").map((b) => ({ ...b, key: `${b.key}{${chordStrokeToken("R!")}}` })),
      ],
    })
    return { ...harness, runs }
  }

  test("ends on the second key whatever ctrl or meta it holds", async () => {
    const { press, runs, legacyKeys } = await bracketF()
    press("]")
    press("f")
    press("]")
    press("\x06")
    press("]")
    press("\x1bf")
    expect(runs).toEqual(["]f", "]f", "]f"])
    expect(legacyKeys).toEqual([])
  })

  test("starts on a modified opener", async () => {
    const { press, runs } = await bracketF()
    press("\x1d")
    press("f")
    expect(runs).toEqual(["]f"])
  })

  test("matches the suffix exactly, shift included, and leaves a key that misses unprevented", async () => {
    const { press, runs, legacyKeys } = await bracketF()
    press("]")
    const shiftedR = press("\x1b[114;2u")
    press("]")
    press("F")
    expect(runs).toEqual([])
    expect(legacyKeys).toEqual(["r", "f"])
    expect(shiftedR.defaultPrevented).toBe(false)
  })

  test("leaves no sequence pending when its command declines the key", async () => {
    const { press, runs, riffKeymap, legacyKeys } = await bracketF(() => false)
    press("]")
    expect(riffKeymap.chordPending()).toBe(true)
    const declined = press("f")
    expect(runs).toEqual(["]f"])
    expect(riffKeymap.chordPending()).toBe(false)
    expect(declined.defaultPrevented).toBe(false)
    expect(legacyKeys).toEqual(["f"])
  })
})
