import { test, expect, describe } from "bun:test"
import type { SimpleHighlight } from "@opentui/core"
import { FileParses, FILE_HIGHLIGHT_LIMIT, type FileVersions } from "./file-parses"
import { MAX_HIGHLIGHT_BYTES } from "./file-highlights"

interface Call {
  text: string
  filetype: string
  resolve: (highlights: SimpleHighlight[] | null) => void
}

/** A parse that answers only when the test says so, so landing order is the test's to choose. */
function deferredParse() {
  const calls: Call[] = []
  const parse = (text: string, filetype: string) =>
    new Promise<SimpleHighlight[] | null>((resolve) => calls.push({ text, filetype, resolve }))
  return { calls, parse }
}

/** A parse that answers at once, with one highlight spanning the text. */
function instantParse() {
  const calls: Array<{ text: string; filetype: string }> = []
  const parse = async (text: string, filetype: string): Promise<SimpleHighlight[] | null> => {
    calls.push({ text, filetype })
    return [[0, text.length, filetype]]
  }
  return { calls, parse }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function versions(entries: Record<string, FileVersions>): Map<string, FileVersions> {
  return new Map(Object.entries(entries))
}

describe("the files' whole-file parses", () => {
  test("parse both sides of a file and announce each as it lands", async () => {
    const { calls, parse } = instantParse()
    const parses = new FileParses(parse)
    const parsed: string[] = []
    parses.onParsed = (filename) => parsed.push(filename)

    parses.set(versions({ "a.ts": { new: "let a = 2", old: "let a = 1" } }))
    await settle()

    expect(calls.map((call) => [call.text, call.filetype])).toEqual([
      ["let a = 2", "typescript"],
      ["let a = 1", "typescript"],
    ])
    expect(parses.get("a.ts")?.new?.highlights).toEqual([[0, 9, "typescript"]])
    expect(parses.get("a.ts")?.old?.highlights).toEqual([[0, 9, "typescript"]])
    expect(parsed).toEqual(["a.ts", "a.ts"])
  })

  test("do not parse a file again whose text has not moved", async () => {
    const { calls, parse } = instantParse()
    const parses = new FileParses(parse)

    parses.set(versions({ "a.ts": { new: "let a = 2", old: null } }))
    await settle()
    const highlights = parses.get("a.ts")?.new?.highlights
    parses.set(versions({ "a.ts": { new: "let a = 2", old: null } }))
    await settle()

    expect(calls).toHaveLength(1)
    expect(parses.get("a.ts")?.new?.highlights).toBe(highlights!)
  })

  test("let go of a file too big to be worth parsing", async () => {
    const { calls, parse } = instantParse()
    const parses = new FileParses(parse)

    parses.set(versions({ "a.ts": { new: "let a = 2", old: null } }))
    await settle()
    parses.set(versions({ "a.ts": { new: "x".repeat(MAX_HIGHLIGHT_BYTES + 1), old: null } }))
    await settle()

    expect(calls).toHaveLength(1)
    expect(parses.get("a.ts")).toBeUndefined()
  })

  test("drop a file riff no longer has the text of", async () => {
    const { parse } = instantParse()
    const parses = new FileParses(parse)

    parses.set(versions({ "a.ts": { new: "a", old: null }, "b.ts": { new: "b", old: null } }))
    parses.set(versions({ "b.ts": { new: "b", old: null } }))

    expect(parses.get("a.ts")).toBeUndefined()
    expect(parses.get("b.ts")).toBeDefined()
  })

  test("hold only the most recent files", () => {
    const { parse } = instantParse()
    const parses = new FileParses(parse)
    const many: Record<string, FileVersions> = {}
    for (let i = 0; i < FILE_HIGHLIGHT_LIMIT + 2; i++) many[`f${i}.ts`] = { new: `${i}`, old: null }

    parses.set(versions(many))

    expect(parses.get("f0.ts")).toBeUndefined()
    expect(parses.get("f1.ts")).toBeUndefined()
    expect(parses.get("f2.ts")).toBeDefined()
    expect(parses.get(`f${FILE_HIGHLIGHT_LIMIT + 1}.ts`)).toBeDefined()
  })

  test("discard a parse of text a refresh has since replaced", async () => {
    const { calls, parse } = deferredParse()
    const parses = new FileParses(parse)
    const parsed: string[] = []
    parses.onParsed = (filename) => parsed.push(filename)

    parses.set(versions({ "a.ts": { new: "first", old: null } }))
    parses.set(versions({ "a.ts": { new: "second", old: null } }))
    calls[0]!.resolve([[0, 5, "stale"]])
    await settle()

    expect(parses.get("a.ts")?.new).toEqual({ content: "second", highlights: null })
    expect(parsed).toEqual([])

    calls[1]!.resolve([[0, 6, "fresh"]])
    await settle()
    expect(parses.get("a.ts")?.new?.highlights).toEqual([[0, 6, "fresh"]])
    expect(parsed).toEqual(["a.ts"])
  })

  test("stay quiet about a parse that lands after they were disposed", async () => {
    const { calls, parse } = deferredParse()
    const parses = new FileParses(parse)
    const parsed: string[] = []
    parses.onParsed = (filename) => parsed.push(filename)

    parses.set(versions({ "a.ts": { new: "let a", old: null } }))
    parses.dispose()
    calls[0]!.resolve([[0, 3, "keyword"]])
    await settle()

    expect(parsed).toEqual([])
  })

  test("never parse a file riff has no filetype for", async () => {
    const { calls, parse } = instantParse()
    const parses = new FileParses(parse)

    parses.set(versions({ "notes.unknownext": { new: "text", old: "older" } }))
    await settle()

    expect(calls).toEqual([])
    expect(parses.get("notes.unknownext")?.new?.highlights).toBeNull()
  })

  test("lay a tagged template's own colours over the host file's", async () => {
    const { calls, parse } = instantParse()
    const parses = new FileParses(parse)
    const content = "const q = graphql`query { id }`"

    parses.set(versions({ "a.tsx": { new: content, old: null } }))
    await settle()

    expect(calls.map((call) => call.filetype)).toEqual(["tsx", "graphql"])
    const start = content.indexOf("query")
    const end = content.lastIndexOf("`")
    expect(parses.get("a.tsx")?.new?.highlights).toEqual([
      [0, content.length, "tsx"],
      [start, end, "graphql"],
    ])
  })
})
