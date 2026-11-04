import { describe, expect, test } from "bun:test"
import { matchSpans, spansText } from "./match-spans"

const m = (text: string) => ({ text, matched: true })
const u = (text: string) => ({ text, matched: false })

describe("matchSpans", () => {
  test("cuts the text into runs at the matched characters, adjacent ones joined", () => {
    expect(matchSpans("FamilyReadModel", [0, 6, 10])).toEqual([m("F"), u("amily"), m("R"), u("ead"), m("M"), u("odel")])
    expect(matchSpans("Open in Editor", [0, 1, 8, 9])).toEqual([m("Op"), u("en in "), m("Ed"), u("itor")])
  })

  test("a fully matched text is one matched run", () => {
    expect(matchSpans("abc", [0, 1, 2])).toEqual([m("abc")])
  })

  test("no positions, or none given, is the text in one plain run; an empty text has no runs", () => {
    expect(matchSpans("abc", [])).toEqual([u("abc")])
    expect(matchSpans("abc")).toEqual([u("abc")])
    expect(matchSpans("", [0, 1])).toEqual([])
  })

  test("a positive offset draws a text that starts that far into what was matched", () => {
    // Matched against "src/greet.ts", drawn from "greet.ts".
    expect(matchSpans("greet.ts", [0, 4, 5, 6], 4)).toEqual([m("gre"), u("et.ts")])
  })

  test("a negative offset draws the match after a prefix the row adds", () => {
    // Matched against "octocat", drawn as "@octocat".
    expect(matchSpans("@octocat", [0, 1, 2], -1)).toEqual([u("@"), m("oct"), u("ocat")])
  })

  test("positions outside the drawn text are dropped", () => {
    expect(matchSpans("abc", [-1, 3, 7])).toEqual([u("abc")])
    expect(matchSpans("greet.ts", [0, 1, 2], 4)).toEqual([u("greet.ts")])
  })

  test("nothing at or past `visible` is matched, for text cut with …", () => {
    expect(matchSpans("FamilyRe…", [0, 6, 8], 0, 8)).toEqual([m("F"), u("amily"), m("R"), u("e…")])
    expect(matchSpans("abcdef", [0, 1, 2, 3], 0, 2)).toEqual([m("ab"), u("cdef")])
  })

  test("the spans always read back as the text", () => {
    expect(spansText(matchSpans("Toggle File Panel", [0, 7, 12], 0, 9))).toBe("Toggle File Panel")
  })
})
