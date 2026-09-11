import { test, expect, describe } from "bun:test"
import { detectEmojiTrigger, filterEmoji, EMOJI } from "./emoji"

describe("the `:` trigger", () => {
  test("opens on a colon that starts a word, once something is typed", () => {
    expect(detectEmojiTrigger(":ta", 3)).toEqual({ query: "ta", colonOffset: 0 })
    expect(detectEmojiTrigger("ship it :roc", 12)).toEqual({ query: "roc", colonOffset: 8 })
  })

  test("a bare colon is not one — prose is full of them", () => {
    expect(detectEmojiTrigger(":", 1)).toBeNull()
    expect(detectEmojiTrigger("note: this", 10)).toBeNull()
    expect(detectEmojiTrigger("http://x", 8)).toBeNull()
  })

  test("nor is one in the middle of a word", () => {
    expect(detectEmojiTrigger("a:b", 3)).toBeNull()
  })

  test("a space closes it", () => {
    expect(detectEmojiTrigger(":tada ", 6)).toBeNull()
  })
})

describe("finding the one you meant", () => {
  test("the shortcode you started comes first", () => {
    expect(filterEmoji("smi")[0]?.name).toBe("smile")
  })

  test("what it means finds it too", () => {
    expect(filterEmoji("lgtm").map((e) => e.char)).toEqual(["👍"])
    expect(filterEmoji("broken").map((e) => e.char)).toContain("🐛")
  })

  test("nothing typed, nothing offered", () => {
    expect(filterEmoji("")).toEqual([])
  })

  test("the list is capped — a picker you scroll is one you stop using", () => {
    expect(filterEmoji("a", 8).length).toBeLessThanOrEqual(8)
  })

  test("every shortcode is unique", () => {
    expect(new Set(EMOJI.map((e) => e.name)).size).toBe(EMOJI.length)
  })
})
