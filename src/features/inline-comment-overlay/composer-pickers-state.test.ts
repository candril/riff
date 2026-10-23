import { describe, expect, test } from "bun:test"
import { createComposerPickersState, type ComposerPickersState as Pickers } from "./composer-pickers-state"

describe("createComposerPickersState", () => {
  test("starts with neither picker open", () => {
    const pickers = createComposerPickersState()
    expect([pickers.mention(), pickers.emoji()]).toEqual([null, null])
  })

  test("a new mention trigger opens the picker on its first match", () => {
    const pickers = createComposerPickersState()
    pickers.setMention({ query: "da", atOffset: 4 })
    expect(pickers.mention()).toEqual({ query: "da", atOffset: 4, selectedIndex: 0 })
  })

  test("the same mention trigger again keeps the selection", () => {
    const pickers = createComposerPickersState()
    pickers.setMention({ query: "da", atOffset: 4 })
    pickers.moveMention(1, 3)
    const before = pickers.mention()
    pickers.setMention({ query: "da", atOffset: 4 })
    expect(pickers.mention()).toBe(before)
    expect(pickers.mention()?.selectedIndex).toBe(1)
  })

  test("a changed query or @ resets the mention selection to the top", () => {
    const pickers = createComposerPickersState()
    pickers.setMention({ query: "da", atOffset: 4 })
    pickers.moveMention(1, 3)
    pickers.setMention({ query: "dav", atOffset: 4 })
    expect(pickers.mention()?.selectedIndex).toBe(0)
    pickers.moveMention(1, 3)
    pickers.setMention({ query: "dav", atOffset: 9 })
    expect(pickers.mention()).toEqual({ query: "dav", atOffset: 9, selectedIndex: 0 })
  })

  test("a null mention trigger closes only the mention picker", () => {
    const pickers = createComposerPickersState()
    pickers.setMention({ query: "da", atOffset: 0 })
    pickers.setEmoji({ query: "smil", colonOffset: 3 })
    pickers.setMention(null)
    expect(pickers.mention()).toBeNull()
    expect(pickers.emoji()).not.toBeNull()
  })

  test("a new emoji trigger opens the picker on its first match", () => {
    const pickers = createComposerPickersState()
    pickers.setEmoji({ query: "smil", colonOffset: 3 })
    expect(pickers.emoji()).toEqual({ query: "smil", colonOffset: 3, selectedIndex: 0 })
  })

  test("the same emoji trigger again keeps the selection; a changed one resets it", () => {
    const pickers = createComposerPickersState()
    pickers.setEmoji({ query: "smil", colonOffset: 3 })
    pickers.moveEmoji(2, 5)
    pickers.setEmoji({ query: "smil", colonOffset: 3 })
    expect(pickers.emoji()?.selectedIndex).toBe(2)
    pickers.setEmoji({ query: "smi", colonOffset: 3 })
    expect(pickers.emoji()?.selectedIndex).toBe(0)
    pickers.moveEmoji(2, 5)
    pickers.setEmoji({ query: "smi", colonOffset: 0 })
    expect(pickers.emoji()?.selectedIndex).toBe(0)
  })

  test("a null emoji trigger closes only the emoji picker", () => {
    const pickers = createComposerPickersState()
    pickers.setMention({ query: "da", atOffset: 0 })
    pickers.setEmoji({ query: "smil", colonOffset: 3 })
    pickers.setEmoji(null)
    expect(pickers.emoji()).toBeNull()
    expect(pickers.mention()).not.toBeNull()
  })

  for (const [name, open, move, selected] of [
    [
      "mention",
      (p: Pickers) => p.setMention({ query: "", atOffset: 0 }),
      (p: Pickers, delta: number, count: number) => p.moveMention(delta, count),
      (p: Pickers) => p.mention()?.selectedIndex,
    ],
    [
      "emoji",
      (p: Pickers) => p.setEmoji({ query: "", colonOffset: 0 }),
      (p: Pickers, delta: number, count: number) => p.moveEmoji(delta, count),
      (p: Pickers) => p.emoji()?.selectedIndex,
    ],
  ] as const) {
    test(`moving the ${name} selection wraps at both ends`, () => {
      const pickers = createComposerPickersState()
      open(pickers)
      move(pickers, -1, 3)
      expect(selected(pickers)).toBe(2)
      move(pickers, 1, 3)
      expect(selected(pickers)).toBe(0)
      move(pickers, 1, 3)
      expect(selected(pickers)).toBe(1)
    })

    test(`moving the ${name} selection does nothing with no candidates or no picker`, () => {
      const pickers = createComposerPickersState()
      move(pickers, 1, 3)
      expect(selected(pickers)).toBeUndefined()
      open(pickers)
      move(pickers, 1, 0)
      expect(selected(pickers)).toBe(0)
    })
  }

  test("clear closes both pickers", () => {
    const pickers = createComposerPickersState()
    pickers.setMention({ query: "da", atOffset: 0 })
    pickers.setEmoji({ query: "smil", colonOffset: 3 })
    pickers.clear()
    expect([pickers.mention(), pickers.emoji()]).toEqual([null, null])
  })
})
