import { describe, expect, test } from "bun:test"
import { fuzzyFilter, fuzzyFilterMatches, fuzzyMatch, fuzzyMatchPositions } from "./fuzzy"
import { matchSpans } from "../components/match-spans"

describe("fuzzyMatchPositions: which characters a query matched", () => {
  test("a scattered query picks out the humps it landed on: frm in FamilyReadModel is F, R and M", () => {
    expect(fuzzyMatchPositions("frm", "FamilyReadModel")?.positions).toEqual([0, 6, 10])
  })

  test("case does not matter to the positions", () => {
    expect(fuzzyMatchPositions("FRM", "FamilyReadModel")?.positions).toEqual([0, 6, 10])
  })

  test("an exact match is every character", () => {
    expect(fuzzyMatchPositions("editor", "Editor")?.positions).toEqual([0, 1, 2, 3, 4, 5])
  })

  test("a prefix is its leading run", () => {
    expect(fuzzyMatchPositions("open", "Open in Editor")?.positions).toEqual([0, 1, 2, 3])
  })

  test("a substring is its run where it first occurs, at a word start or inside a word", () => {
    expect(fuzzyMatchPositions("ed", "Open in Editor")?.positions).toEqual([8, 9])
    expect(fuzzyMatchPositions("pen", "Open in Editor")?.positions).toEqual([1, 2, 3])
  })

  test("a scattered query takes its best-scoring place, not each character's first: ne is the n of in before Editor's E", () => {
    expect(fuzzyMatchPositions("ne", "Open in Editor")?.positions).toEqual([6, 8])
  })

  test("a scattered query prefers word starts further on to the first occurrence: fm in FamilyReadModel is F and the M of Model", () => {
    expect(fuzzyMatchPositions("fm", "FamilyReadModel")?.positions).toEqual([0, 10])
  })

  test("several terms highlight the union of their characters, in order, whatever order they were typed in", () => {
    expect(fuzzyMatchPositions("op ed", "Open in Editor")?.positions).toEqual([0, 1, 8, 9])
    expect(fuzzyMatchPositions("ed op", "Open in Editor")?.positions).toEqual([0, 1, 8, 9])
    expect(fuzzyMatchPositions("editor open", "Open in Editor")?.positions).toEqual([0, 1, 2, 3, 8, 9, 10, 11, 12, 13])
  })

  test("two terms landing on the same character highlight it once", () => {
    expect(fuzzyMatchPositions("o op", "Open")?.positions).toEqual([0, 1])
  })

  test("null when a character is missing, or out of order, or one term of several misses", () => {
    expect(fuzzyMatchPositions("xyz", "abc")).toBeNull()
    expect(fuzzyMatchPositions("nfe", "Open in Editor")).toBeNull()
    expect(fuzzyMatchPositions("open zz", "Open in Editor")).toBeNull()
  })

  test("an empty or blank query matches with nothing to highlight", () => {
    expect(fuzzyMatchPositions("", "abc")).toEqual({ score: 1, positions: [] })
    expect(fuzzyMatchPositions("   ", "abc")).toEqual({ score: 1, positions: [] })
  })
})

describe("scores: the match classes, and the best alignment within a scattered match", () => {
  // A scattered match scores its best alignment: +10 at a word start, +12
  // right after the previous character, +2 elsewhere, less 2 for a gap and
  // 0.5 for each skipped character beyond its first.
  const SCORES: [query: string, text: string, score: number][] = [
    ["", "abc", 1],
    ["xyz", "abc", 0],
    ["editor", "editor", 1000],
    ["open", "Open in Editor", 800],
    ["ed", "Open in Editor", 700],
    ["edi", "Open in Editor", 700],
    ["pen", "Open in Editor", 600],
    ["op ed", "Open in Editor", 750],
    ["ne", "Open in Editor", 10],
    ["frm", "FamilyReadModel", 23],
    ["fi", "FamilyReadModel", 9.5],
    ["ff", "Find Files", 16.5],
    ["tfp", "Toggle File Panel", 22],
    ["aa", "abcabc", 9.5],
  ]

  for (const [query, text, score] of SCORES) {
    test(`${JSON.stringify(query)} against ${JSON.stringify(text)} scores ${score}`, () => {
      expect(fuzzyMatch(query, text)).toBe(score)
      expect(fuzzyMatchPositions(query, text)?.score ?? 0).toBe(score)
    })
  }

  test("two word starts outrank a first character and one inside a word: rm finds FamilyReadModel.cs before remote.ts", () => {
    const files = ["src/features/remote.ts", "src/domain/FamilyReadModel.cs"]
    const basenameFirst = (f: string) => [f.slice(f.lastIndexOf("/") + 1), f]
    expect(fuzzyFilter("rm", files, basenameFirst)).toEqual(["src/domain/FamilyReadModel.cs", "src/features/remote.ts"])
  })
})

describe("fuzzyFilterMatches", () => {
  test("keeps fuzzyFilter's order, and says which text each item matched on and where", () => {
    const items = ["src/greet.ts", "src/farewell.ts", "docs/guide.md"]
    const texts = (f: string) => [f.slice(f.lastIndexOf("/") + 1), f]
    const hits = fuzzyFilterMatches("src", items, texts)
    expect(hits.map(({ item }) => item)).toEqual(fuzzyFilter("src", items, texts))
    expect(hits).toEqual([
      { item: "src/greet.ts", field: 1, positions: [0, 1, 2] },
      { item: "src/farewell.ts", field: 1, positions: [0, 1, 2] },
    ])
  })

  test("the first of several texts wins a tie, so a basename hit is reported against the basename", () => {
    expect(fuzzyFilterMatches("greet", ["src/greet.ts"], (f) => [f.slice(4), f])).toEqual([
      { item: "src/greet.ts", field: 0, positions: [0, 1, 2, 3, 4] },
    ])
  })

  test("an empty query keeps every item with nothing matched", () => {
    expect(fuzzyFilterMatches("", ["a", "b"], (s) => s)).toEqual([
      { item: "a", field: 0, positions: [] },
      { item: "b", field: 0, positions: [] },
    ])
  })
})

describe("positions index the text as given, whatever lowercasing it does", () => {
  const m = (text: string) => ({ text, matched: true })
  const u = (text: string) => ({ text, matched: false })
  const spansFor = (query: string, text: string) => matchSpans(text, fuzzyMatchPositions(query, text)?.positions)

  // "İ".toLowerCase() is "i" and a combining dot: two code units for one.
  test("a character that lowercases to two units does not push the match one place on", () => {
    expect(fuzzyMatchPositions("x", "İx")?.positions).toEqual([1])
    expect(fuzzyMatchPositions("ab", "İaxb")?.positions).toEqual([1, 3])
    expect(fuzzyMatchPositions("ab", "İab")?.positions).toEqual([1, 2])
    expect(spansFor("ab", "İaxb")).toEqual([u("İ"), m("a"), u("x"), m("b")])
    expect(spansFor("ab", "İab")).toEqual([u("İ"), m("ab")])
  })

  test("the İ itself matches an i, and is the one character highlighted", () => {
    expect(fuzzyMatchPositions("ix", "İx")?.positions).toEqual([0, 1])
    expect(spansFor("i", "İstanbul")).toEqual([m("İ"), u("stanbul")])
  })

  test("ẞ folds to ß, one unit for one, either way round", () => {
    expect(fuzzyMatchPositions("ß", "STRAẞE")?.positions).toEqual([4])
    expect(fuzzyMatchPositions("ẞe", "straße")?.positions).toEqual([4, 5])
    expect(spansFor("ße", "STRAẞE")).toEqual([u("STRA"), m("ẞE")])
  })

  test("an emoji before the match counts as the two units it is", () => {
    expect(fuzzyMatchPositions("ab", "🙂ab")?.positions).toEqual([2, 3])
    expect(fuzzyMatchPositions("ab", "🙂axb")?.positions).toEqual([2, 4])
    expect(spansFor("ab", "🙂axb")).toEqual([u("🙂"), m("a"), u("x"), m("b")])
  })
})
