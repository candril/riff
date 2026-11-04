import { describe, expect, test } from "bun:test"
import { fuzzyFilter, fuzzyFilterMatches, fuzzyMatchPositions } from "./fuzzy"

describe("word starts: where a scattered match prefers to land", () => {
  // In each text the b right after "ax" costs one skipped character, the one
  // past the separator three: only the word-start bonus makes the far one win.
  for (const sep of ["/", "_", "-", ".", " "]) {
    test(`after ${JSON.stringify(sep)}: ab in ${JSON.stringify(`axb${sep}b`)} takes the b past it`, () => {
      expect(fuzzyMatchPositions("ab", `axb${sep}b`)?.positions).toEqual([0, 4])
    })
  }

  test("at a camelCase hump: ab in axbBar takes the B of Bar", () => {
    expect(fuzzyMatchPositions("ab", "axbBar")?.positions).toEqual([0, 3])
  })

  test("not after a digit, nor at a capital after a capital: ab in axb1b and axbXB takes the nearer b", () => {
    expect(fuzzyMatchPositions("ab", "axb1b")?.positions).toEqual([0, 2])
    expect(fuzzyMatchPositions("ab", "axbXB")?.positions).toEqual([0, 2])
  })

  test("a substring takes its first occurrence at a word start, past one inside a word", () => {
    expect(fuzzyMatchPositions("model", "remodel/model")?.positions).toEqual([8, 9, 10, 11, 12])
    expect(fuzzyMatchPositions("model", "remodelModel")?.positions).toEqual([7, 8, 9, 10, 11])
    expect(fuzzyMatchPositions("model", "remodelmodel")?.positions).toEqual([2, 3, 4, 5, 6])
  })

  test("ut ranks src/utils/types.ts, a word start, above src/output.ts, mid-word, on the path", () => {
    expect(fuzzyFilter("ut", ["src/output.ts", "src/utils/types.ts"], (f) => f)).toEqual([
      "src/utils/types.ts",
      "src/output.ts",
    ])
  })

  test("fm ranks FamilyModel's two humps above frame.ts's f and an m inside the word, against list order", () => {
    expect(fuzzyFilter("fm", ["src/frame.ts", "src/FamilyModel.ts"], (f) => f)).toEqual([
      "src/FamilyModel.ts",
      "src/frame.ts",
    ])
  })

  test("a word start after an underscore or a dash ranks above one inside a word", () => {
    expect(fuzzyFilter("ub", ["src/usxbx.ts", "src/usx_b.ts", "src/usx-b.ts"], (f) => f)).toEqual([
      "src/usx_b.ts",
      "src/usx-b.ts",
      "src/usxbx.ts",
    ])
  })
})

/** Deterministic, so a failure reproduces from its seed. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALPHABET = "aabbcAB/_-.1 "
const pick = (rand: () => number, chars: string, length: number) =>
  Array.from({ length }, () => chars[Math.floor(rand() * chars.length)]!).join("")

/** The documented rules, independently: what an alignment of a scattered match scores. */
function scoreOf(text: string, positions: number[]): number {
  const wordStart = (i: number) => {
    if (i === 0) return true
    const prev = text[i - 1]!
    if (!/[A-Za-z0-9]/.test(prev)) return true
    return /[a-z0-9]/.test(prev) && /[A-Z]/.test(text[i]!)
  }
  let score = 0
  positions.forEach((p, k) => {
    if (k > 0 && p === positions[k - 1]! + 1) return void (score += 12)
    score += wordStart(p) ? 10 : 2
    if (k > 0) score -= 2 + 0.5 * (p - positions[k - 1]! - 2)
  })
  return score
}

const clamp = (score: number) => Math.max(1, Math.min(500, score))

/** Every way the term's characters can sit in the text, in order. */
function alignments(term: string, lower: string, from = 0): number[][] {
  if (term.length === 0) return [[]]
  const out: number[][] = []
  for (let i = from; i < lower.length; i++) {
    if (lower[i] !== term[0]) continue
    for (const rest of alignments(term.slice(1), lower, i + 1)) out.push([i, ...rest])
  }
  return out
}

describe("property: positions and score agree, over generated inputs", () => {
  const CASES = 3000
  const rand = rng(7)
  const cases = Array.from({ length: CASES }, () => {
    const text = pick(rand, ALPHABET, 4 + Math.floor(rand() * 16))
    const term = pick(rand, "abc", 2 + Math.floor(rand() * 3))
    return { text, term }
  })

  test("a match's positions are strictly increasing, in bounds, and spell the term case-insensitively", () => {
    let matched = 0
    for (const { text, term } of cases) {
      const match = fuzzyMatchPositions(term, text)
      const exists = alignments(term, text.toLowerCase()).length > 0
      expect({ text, term, matched: match !== null }).toEqual({ text, term, matched: exists })
      if (!match) continue
      matched++
      const { positions } = match
      for (let k = 0; k < positions.length; k++) {
        expect(positions[k]).toBeGreaterThanOrEqual(0)
        expect(positions[k]).toBeLessThan(text.length)
        if (k > 0) expect(positions[k]).toBeGreaterThan(positions[k - 1]!)
      }
      expect({ text, term, spelled: positions.map((p) => text[p]!.toLowerCase()).join("") }).toEqual({ text, term, spelled: term })
    }
    // The generator has to actually exercise matches, not just misses.
    expect(matched).toBeGreaterThan(CASES / 4)
  })

  test("a scattered match scores what its positions earn by the rules, and no alignment earns more", () => {
    let scattered = 0
    for (const { text, term } of cases) {
      const lower = text.toLowerCase()
      if (lower.includes(term)) continue
      const match = fuzzyMatchPositions(term, text)
      if (!match) continue
      scattered++
      const best = Math.max(...alignments(term, lower).map((a) => scoreOf(text, a)))
      expect({ text, term, score: match.score }).toEqual({ text, term, score: clamp(scoreOf(text, match.positions)) })
      expect({ text, term, score: match.score }).toEqual({ text, term, score: clamp(best) })
    }
    expect(scattered).toBeGreaterThan(CASES / 10)
  })

  test("a substring match's positions are one run where the term occurs", () => {
    for (const { text, term } of cases) {
      if (!text.toLowerCase().includes(term)) continue
      const { positions } = fuzzyMatchPositions(term, text)!
      expect(positions).toEqual(Array.from({ length: term.length }, (_, i) => positions[0]! + i))
      expect(text.slice(positions[0]!, positions[0]! + term.length).toLowerCase()).toBe(term)
    }
  })

  test("several terms highlight a strictly increasing set in bounds, each term's characters among them", () => {
    const rand = rng(11)
    for (let n = 0; n < 1000; n++) {
      const text = pick(rand, ALPHABET, 1 + Math.floor(rand() * 14))
      const query = `${pick(rand, "abc", 1 + Math.floor(rand() * 2))} ${pick(rand, "abc", 1 + Math.floor(rand() * 2))}`
      const match = fuzzyMatchPositions(query, text)
      if (!match) continue
      const { positions } = match
      for (let k = 0; k < positions.length; k++) {
        expect(positions[k]).toBeGreaterThanOrEqual(0)
        expect(positions[k]).toBeLessThan(text.length)
        if (k > 0) expect(positions[k]).toBeGreaterThan(positions[k - 1]!)
      }
      for (const term of query.split(" ")) {
        const own = fuzzyMatchPositions(term, text)!.positions
        for (const p of own) expect(positions).toContain(p)
      }
    }
  })
})

describe("performance", () => {
  test("5000 paths filter on a 3-character query in under 50 ms", () => {
    const rand = rng(3)
    const segment = () => pick(rand, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ_-", 3 + Math.floor(rand() * 10))
    const paths = Array.from({ length: 5000 }, () => {
      const depth = 1 + Math.floor(rand() * 5)
      return `${Array.from({ length: depth }, segment).join("/")}/${segment()}.${pick(rand, "tsxmdjs", 2)}`
    })
    const basenameFirst = (f: string) => [f.slice(f.lastIndexOf("/") + 1), f]
    fuzzyFilterMatches("xyz", paths, basenameFirst)

    const start = performance.now()
    const hits = fuzzyFilterMatches("frm", paths, basenameFirst)
    const elapsed = performance.now() - start

    expect(hits.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(50)
  })
})
