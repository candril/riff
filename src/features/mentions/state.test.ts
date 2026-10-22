import { describe, expect, test } from "bun:test"
import { createMentionsState } from "./state"

describe("the @mention pool's factory", () => {
  test("merging dedupes case-insensitively, keeping the first spelling and the order", () => {
    const mentions = createMentionsState()
    mentions.merge(["Dana", "dave"])
    mentions.merge(["dana", "DAVE", "alma"])
    expect(mentions.pool()).toEqual(["Dana", "dave", "alma"])
  })

  test("merging nothing new keeps the same array", () => {
    const mentions = createMentionsState()
    mentions.merge(["dana"])
    const before = mentions.pool()
    mentions.merge(["DANA"])
    mentions.merge([])
    expect(mentions.pool()).toBe(before)
  })

  test("a search that settles clears its hint and merges what it found", () => {
    const mentions = createMentionsState()
    mentions.searchStarted("da")
    expect(mentions.searching()).toBe("da")
    mentions.searchSettled("da", ["dana"])
    expect(mentions.searching()).toBeNull()
    expect(mentions.pool()).toEqual(["dana"])
  })

  test("a stale search leaves the newer query's hint up but still merges", () => {
    const mentions = createMentionsState()
    mentions.searchStarted("da")
    mentions.searchStarted("dan")
    mentions.searchSettled("da", ["dave"])
    expect(mentions.searching()).toBe("dan")
    expect(mentions.pool()).toEqual(["dave"])
  })

  test("starting the search already under way changes nothing", () => {
    const mentions = createMentionsState()
    mentions.searchStarted("da")
    mentions.searchStarted("da")
    expect(mentions.searching()).toBe("da")
    mentions.searchSettled("da", [])
    expect(mentions.searching()).toBeNull()
  })
})
