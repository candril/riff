import { describe, expect, test } from "bun:test"
import { detectAtTrigger, MENTION_QUERY_CHARS } from "./mentions"

describe("an @ trigger", () => {
  test("is an @ at the start of the input or after whitespace, with the query typed since", () => {
    expect(detectAtTrigger("@al", 3, MENTION_QUERY_CHARS)).toEqual({ query: "al", atOffset: 0 })
    expect(detectAtTrigger("hi @org/team", 12, MENTION_QUERY_CHARS)).toEqual({ query: "org/team", atOffset: 3 })
    expect(detectAtTrigger("hi @", 4, MENTION_QUERY_CHARS)).toEqual({ query: "", atOffset: 3 })
  })

  test("is no trigger inside a word, past a space, or with the cursor elsewhere", () => {
    expect(detectAtTrigger("me@al", 5, MENTION_QUERY_CHARS)).toBeNull()
    expect(detectAtTrigger("@al ", 4, MENTION_QUERY_CHARS)).toBeNull()
    expect(detectAtTrigger("@al", 0, MENTION_QUERY_CHARS)).toBeNull()
    expect(detectAtTrigger("@al", 9, MENTION_QUERY_CHARS)).toBeNull()
  })

  test("reads only the characters the input allows in its query", () => {
    expect(detectAtTrigger("@src/a.ts", 9, MENTION_QUERY_CHARS)).toBeNull()
    expect(detectAtTrigger("see @src/a.ts", 13, /\S/)).toEqual({ query: "src/a.ts", atOffset: 4 })
    expect(detectAtTrigger("see @src/a.ts", 8, /\S/)).toEqual({ query: "src", atOffset: 4 })
  })
})
