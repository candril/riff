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

  for (const drop of ["forgetSpan", "clear"] as const) {
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
