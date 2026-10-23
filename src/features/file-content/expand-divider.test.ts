import { describe, expect, test } from "bun:test"
import { createFileContentState } from "./state"
import { expandDividerAtCursor, type ExpandDividerContext } from "./expand-divider"
import type { FetchFileVersions } from "./load"

const KEY = "a.ts:middle:0"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function context(fetchFileVersions: FetchFileVersions, dividerKey: string | null = KEY) {
  const fileContent = createFileContentState()
  const calls: string[] = []
  const fetched: string[] = []
  const ctx: ExpandDividerContext = {
    fileContent,
    fetchFileVersions: (filename) => {
      fetched.push(filename)
      return fetchFileVersions(filename)
    },
    dividerKeyAtCursor: () => dividerKey,
    rebuildLineMapping: () => void calls.push(`rebuild open=${fileContent.isExpanded(KEY)}`),
    render: () => void calls.push(`render expanding=${fileContent.expanding()}`),
    revealCursor: () => void calls.push("reveal"),
  }
  return { ctx, fileContent, calls, fetched }
}

const never: FetchFileVersions = () => Promise.reject(new Error("no fetch expected"))

describe("expandDividerAtCursor", () => {
  test("does nothing off a divider", async () => {
    const { ctx, calls, fetched } = context(never, null)
    expect(await expandDividerAtCursor(ctx)).toBe(false)
    expect([calls, fetched]).toEqual([[], []])
  })

  test("opens a run of a file already read without reading it again", async () => {
    const { ctx, fileContent, calls, fetched } = context(never)
    fileContent.set("a.ts", "new", "old")

    expect(await expandDividerAtCursor(ctx)).toBe(true)

    expect(fetched).toEqual([])
    expect(fileContent.isExpanded(KEY)).toBe(true)
    expect(calls).toEqual(["rebuild open=true", "render expanding=null", "reveal"])
  })

  for (const [name, seed] of [
    ["not read yet", () => {}],
    ["whose last read failed", (f: ReturnType<typeof createFileContentState>) => f.setError("a.ts", "404")],
  ] as const) {
    test(`reads a file ${name}, showing the run as expanding while it waits`, async () => {
      const load = deferred<Awaited<ReturnType<FetchFileVersions>>>()
      const { ctx, fileContent, calls, fetched } = context(() => load.promise)
      seed(fileContent)

      const expanding = expandDividerAtCursor(ctx)
      expect(fetched).toEqual(["a.ts"])
      expect(fileContent.expanding()).toBe(KEY)
      expect(fileContent.entry("a.ts")).toEqual({ newContent: null, oldContent: null, loading: true })
      expect(fileContent.isExpanded(KEY)).toBe(false)

      load.resolve({ ok: true, newContent: "new", oldContent: "old" })
      expect(await expanding).toBe(true)

      expect(fileContent.entry("a.ts")).toEqual({ newContent: "new", oldContent: "old", loading: false })
      expect(fileContent.isExpanded(KEY)).toBe(true)
      expect(fileContent.expanding()).toBeNull()
      expect(calls).toEqual([`render expanding=${KEY}`, "rebuild open=true", "render expanding=null", "reveal"])
    })
  }

  test("a failed read records its error and leaves the run closed", async () => {
    const { ctx, fileContent, calls } = context(async () => ({ ok: false, error: "Not Found" }))

    expect(await expandDividerAtCursor(ctx)).toBe(false)

    expect(fileContent.entry("a.ts")).toEqual({ newContent: null, oldContent: null, loading: false, error: "Not Found" })
    expect(fileContent.isExpanded(KEY)).toBe(false)
    expect(fileContent.expanding()).toBeNull()
    expect(calls).toEqual([`render expanding=${KEY}`, "render expanding=null"])
  })

  test("a thrown read records its message and leaves the run closed", async () => {
    const { ctx, fileContent, calls } = context(async () => {
      throw new Error("socket hang up")
    })

    expect(await expandDividerAtCursor(ctx)).toBe(false)

    expect(fileContent.entry("a.ts")?.error).toBe("socket hang up")
    expect(fileContent.isExpanded(KEY)).toBe(false)
    expect(fileContent.expanding()).toBeNull()
    expect(calls).toEqual([`render expanding=${KEY}`, "render expanding=null"])
  })
})
