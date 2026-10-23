import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test"
import { createFileContentState } from "./state"
import { createHighlightSourceReader, HIGHLIGHT_SOURCE_BATCH, type HighlightSourceDeps } from "./highlight-source"
import type { FetchFileVersions } from "./load"

const DELAY = 150

beforeEach(() => {
  jest.useFakeTimers()
})
afterEach(() => {
  jest.useRealTimers()
})

/** Lets the reads the timer started settle; their promises resolve on the microtask queue. */
const settle = () => Promise.resolve().then(() => {})

function reader(options: { onScreen: string[]; fetch?: FetchFileVersions; patch?: Partial<HighlightSourceDeps> }) {
  const fileContent = createFileContentState()
  const fetched: string[] = []
  let onScreen = options.onScreen
  let renders = 0
  const deps: HighlightSourceDeps = {
    fileContent,
    fetchFileVersions: (filename) => {
      fetched.push(filename)
      return (options.fetch ?? (async () => ({ ok: true, newContent: `new ${filename}`, oldContent: null })))(filename)
    },
    visibleFilenames: () => onScreen,
    scopeSpan: () => null,
    head: () => "head-1",
    target: undefined,
    appMode: () => "pr",
    render: () => void renders++,
    fileSize: () => 0,
    ...options.patch,
  }
  const read = createHighlightSourceReader(deps)
  return {
    read,
    fileContent,
    fetched,
    renders: () => renders,
    show(files: string[]) {
      onScreen = files
    },
  }
}

describe("createHighlightSourceReader", () => {
  test("reads the files on screen once the pause has run, and draws each as it lands", async () => {
    const r = reader({ onScreen: ["a.ts", "b.ts"] })
    r.read.request()
    jest.advanceTimersByTime(DELAY - 1)
    expect(r.fetched).toEqual([])

    jest.advanceTimersByTime(1)
    await settle()

    expect(r.fetched).toEqual(["a.ts", "b.ts"])
    expect(r.fileContent.entry("a.ts")?.newContent).toBe("new a.ts")
    expect(r.renders()).toBe(2)
  })

  test("skips a file read, being read for expansion, or whose read for expansion failed", () => {
    const r = reader({ onScreen: ["read.ts", "loading.ts", "errored.ts"] })
    r.fileContent.set("read.ts", "text", null)
    r.fileContent.markLoading("loading.ts")
    r.fileContent.setError("errored.ts", "404")

    r.read.request()
    jest.advanceTimersByTime(DELAY)

    expect(r.fetched).toEqual([])
  })

  test("skips a file whose read is still in flight", async () => {
    const r = reader({ onScreen: ["a.ts"], fetch: () => new Promise(() => {}) })
    r.read.request()
    jest.advanceTimersByTime(DELAY)
    expect(r.fetched).toEqual(["a.ts"])

    r.read.request()
    jest.advanceTimersByTime(DELAY)

    expect(r.fetched).toEqual(["a.ts"])
  })

  for (const [name, fetch] of [
    ["fails", async () => ({ ok: false as const, error: "Not Found" })],
    ["throws", async () => { throw new Error("socket hang up") }],
  ] as const) {
    test(`does not read again a file whose read ${name}, for the same revisions`, async () => {
      let head = "head-1"
      const r = reader({ onScreen: ["a.ts"], fetch, patch: { head: () => head } })
      r.read.request()
      jest.advanceTimersByTime(DELAY)
      await settle()
      expect(r.fileContent.entry("a.ts")).toBeNull()

      r.read.request()
      jest.advanceTimersByTime(DELAY)
      expect(r.fetched).toEqual(["a.ts"])

      head = "head-2"
      r.read.request()
      jest.advanceTimersByTime(DELAY)
      expect(r.fetched).toEqual(["a.ts", "a.ts"])
    })
  }

  test("a read that lands after the span was forgotten writes and draws nothing", async () => {
    let land!: (value: Awaited<ReturnType<FetchFileVersions>>) => void
    const r = reader({ onScreen: ["a.ts"], fetch: () => new Promise((resolve) => (land = resolve)) })
    r.read.request()
    jest.advanceTimersByTime(DELAY)
    expect(r.fetched).toEqual(["a.ts"])

    r.fileContent.forgetSpan()
    land({ ok: true, newContent: "stale", oldContent: null })
    await settle()

    expect(r.fileContent.entry("a.ts")).toBeNull()
    expect(r.renders()).toBe(0)
  })

  test("a read that fails after the span was forgotten is read again", async () => {
    let land!: (value: Awaited<ReturnType<FetchFileVersions>>) => void
    const r = reader({ onScreen: ["a.ts"], fetch: () => new Promise((resolve) => (land = resolve)) })
    r.read.request()
    jest.advanceTimersByTime(DELAY)

    r.fileContent.forgetSpan()
    land({ ok: false, error: "Not Found" })
    await settle()

    r.read.request()
    jest.advanceTimersByTime(DELAY)
    expect(r.fetched).toEqual(["a.ts", "a.ts"])
  })

  test("an unchanged set of wanted files leaves the pending pause running", () => {
    const r = reader({ onScreen: ["a.ts"] })
    r.read.request()
    jest.advanceTimersByTime(DELAY - 50)
    r.read.request()
    jest.advanceTimersByTime(50)

    expect(r.fetched).toEqual(["a.ts"])
  })

  test("a changed set of wanted files starts the pause again", () => {
    const r = reader({ onScreen: ["a.ts"] })
    r.read.request()
    jest.advanceTimersByTime(DELAY - 50)
    r.show(["a.ts", "b.ts"])
    r.read.request()
    jest.advanceTimersByTime(50)
    expect(r.fetched).toEqual([])

    jest.advanceTimersByTime(DELAY - 50)
    expect(r.fetched).toEqual(["a.ts", "b.ts"])
  })

  test(`reads at most ${HIGHLIGHT_SOURCE_BATCH} files a pass, and the next request reads the rest`, async () => {
    const files = Array.from({ length: 8 }, (_, i) => `f${i}.ts`)
    const r = reader({ onScreen: files })
    r.read.request()
    jest.advanceTimersByTime(DELAY)
    await settle()
    expect(r.fetched).toEqual(files.slice(0, 6))

    r.read.request()
    jest.advanceTimersByTime(DELAY)
    expect(r.fetched).toEqual(files)
  })

  test("locally, a file too big to colour is not read at all", () => {
    const r = reader({ onScreen: ["big.ts", "small.ts"], patch: { appMode: () => "local", fileSize: (f) => (f === "big.ts" ? 10_000_000 : 10) } })
    r.read.request()
    jest.advanceTimersByTime(DELAY)

    expect(r.fetched).toEqual(["small.ts"])
  })

  test("dispose drops a pending pause", () => {
    const r = reader({ onScreen: ["a.ts"] })
    r.read.request()
    r.read.dispose()
    jest.advanceTimersByTime(DELAY)

    expect(r.fetched).toEqual([])
  })
})
