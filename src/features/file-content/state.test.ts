import { describe, expect, test } from "bun:test"
import { createFileContentState } from "./state"

describe("createFileContentState", () => {
  test("starts with nothing read, nothing open and nothing fetching", () => {
    const files = createFileContentState()
    expect(files.contents()).toEqual({})
    expect(files.entry("a.ts")).toBeNull()
    expect([...files.expanded()]).toEqual([])
    expect(files.expanding()).toBeNull()
  })

  test("a file goes from loading to read", () => {
    const files = createFileContentState()
    files.markLoading("a.ts")
    expect(files.entry("a.ts")).toEqual({ newContent: null, oldContent: null, loading: true })
    files.set("a.ts", "new", "old")
    expect(files.entry("a.ts")).toEqual({ newContent: "new", oldContent: "old", loading: false })
    expect(files.contents()).toEqual({ "a.ts": { newContent: "new", oldContent: "old", loading: false } })
  })

  test("a failed read records its error and drops what was read before", () => {
    const files = createFileContentState()
    files.set("a.ts", "new", "old")
    files.setError("a.ts", "404")
    expect(files.entry("a.ts")).toEqual({ newContent: null, oldContent: null, loading: false, error: "404" })
  })

  test("each file keeps its own entry", () => {
    const files = createFileContentState()
    files.set("a.ts", "a", null)
    files.markLoading("b.ts")
    expect(files.entry("a.ts")?.newContent).toBe("a")
    expect(files.entry("b.ts")?.loading).toBe(true)
  })

  test("expand opens a run for good and keeps the set when it is already open", () => {
    const files = createFileContentState()
    files.expand("a.ts:middle:0")
    const open = files.expanded()
    expect(files.isExpanded("a.ts:middle:0")).toBe(true)
    expect(files.isExpanded("a.ts:middle:1")).toBe(false)
    files.expand("a.ts:middle:0")
    expect(files.expanded()).toBe(open)
    files.expand("a.ts:middle:1")
    expect(files.expanded()).not.toBe(open)
    expect([...files.expanded()]).toEqual(["a.ts:middle:0", "a.ts:middle:1"])
  })

  test("setExpanding names the run being fetched, and null ends it", () => {
    const files = createFileContentState()
    files.setExpanding("a.ts:middle:0")
    expect(files.expanding()).toBe("a.ts:middle:0")
    files.setExpanding(null)
    expect(files.expanding()).toBeNull()
  })

  test("forgetSpan drops what was read and opened but leaves the fetch in flight", () => {
    const files = createFileContentState()
    files.set("a.ts", "new", "old")
    files.expand("a.ts:middle:0")
    files.setExpanding("a.ts:middle:1")
    files.forgetSpan()
    expect(files.contents()).toEqual({})
    expect(files.isExpanded("a.ts:middle:0")).toBe(false)
    expect(files.expanding()).toBe("a.ts:middle:1")
  })

  test("clear drops all three", () => {
    const files = createFileContentState()
    files.set("a.ts", "new", "old")
    files.expand("a.ts:middle:0")
    files.setExpanding("a.ts:middle:1")
    files.clear()
    expect(files.contents()).toEqual({})
    expect([...files.expanded()]).toEqual([])
    expect(files.expanding()).toBeNull()
  })

  test("restoreExpanded takes a copy of the runs it is handed", () => {
    const files = createFileContentState()
    const kept = new Set(["a.ts:middle:0"])
    files.restoreExpanded(kept)
    kept.add("a.ts:middle:1")
    expect([...files.expanded()]).toEqual(["a.ts:middle:0"])
  })

  test("restoreExpanded replaces what was open", () => {
    const files = createFileContentState()
    files.expand("b.ts:middle:0")
    files.restoreExpanded(new Set(["a.ts:middle:0"]))
    expect([...files.expanded()]).toEqual(["a.ts:middle:0"])
  })
})
