import { describe, expect, test } from "bun:test"
import { createFileContentState } from "./state"
import { loadFileContent, type FetchFileVersions } from "./load"

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
})
