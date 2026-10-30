import { describe, expect, test } from "bun:test"
import { createFileContentState } from "./state"
import { loadFileContent, type FetchFileVersions } from "./load"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function loading(fetchFileVersions: FetchFileVersions) {
  const fileContent = createFileContentState()
  const drawn: unknown[] = []
  const ctx = { fileContent, fetchFileVersions, render: () => void drawn.push(fileContent.entry("a.ts")) }
  return { fileContent, drawn, load: () => loadFileContent(ctx, "a.ts") }
}

describe("loadFileContent", () => {
  test("draws the file as loading, then as read", async () => {
    const { fileContent, drawn, load } = loading(async () => ({ ok: true, newContent: "new", oldContent: "old" }))
    await load()
    expect(drawn).toEqual([
      { newContent: null, oldContent: null, loading: true },
      { newContent: "new", oldContent: "old", loading: false },
    ])
    expect(fileContent.entry("a.ts")?.newContent).toBe("new")
  })

  test("records a failed read's error", async () => {
    const { fileContent, load } = loading(async () => ({ ok: false, error: "Not Found" }))
    await load()
    expect(fileContent.entry("a.ts")?.error).toBe("Not Found")
  })

  test("records a thrown read's message", async () => {
    const { fileContent, load } = loading(async () => {
      throw new Error("socket hang up")
    })
    await load()
    expect(fileContent.entry("a.ts")?.error).toBe("socket hang up")
  })

  test("a second load while the first is in flight joins it, and asks for the file once", async () => {
    const fetch = deferred<Awaited<ReturnType<FetchFileVersions>>>()
    let asked = 0
    const { fileContent, load } = loading(() => {
      asked++
      return fetch.promise
    })
    const first = load()
    const second = load()
    expect(second).toBe(first)

    fetch.resolve({ ok: true, newContent: "new", oldContent: "old" })
    await second
    expect(asked).toBe(1)
    expect(fileContent.entry("a.ts")?.newContent).toBe("new")
    expect(fileContent.reading("a.ts")).toBeUndefined()
  })

  for (const drop of ["forgetSpan", "clear"] as const) {
    test(`a load after ${drop} reads the file again rather than joining the dropped read`, async () => {
      let asked = 0
      const { fileContent, load } = loading(() => {
        asked++
        return new Promise(() => {})
      })
      void load()
      fileContent[drop]()
      void load()
      expect(asked).toBe(2)
    })

    test(`a read that lands after ${drop} writes nothing and draws nothing`, async () => {
      const fetch = deferred<Awaited<ReturnType<FetchFileVersions>>>()
      const { fileContent, drawn, load } = loading(() => fetch.promise)
      const loaded = load()
      fileContent[drop]()

      fetch.resolve({ ok: true, newContent: "new", oldContent: "old" })
      await loaded

      expect(fileContent.entry("a.ts")).toBeNull()
      expect(drawn).toHaveLength(1)
    })

    test(`a read that fails after ${drop} records no error`, async () => {
      const fetch = deferred<Awaited<ReturnType<FetchFileVersions>>>()
      const { fileContent, drawn, load } = loading(() => fetch.promise)
      const loaded = load()
      fileContent[drop]()

      fetch.reject(new Error("socket hang up"))
      await loaded

      expect(fileContent.entry("a.ts")).toBeNull()
      expect(drawn).toHaveLength(1)
    })
  }
})
