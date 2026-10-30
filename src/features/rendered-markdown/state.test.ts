import { describe, expect, test } from "bun:test"
import { createRenderedMarkdownState } from "./state"

describe("createRenderedMarkdownState", () => {
  test("starts with no file rendered", () => {
    const rendered = createRenderedMarkdownState()
    expect([...rendered.files()]).toEqual([])
    expect(rendered.has("README.md")).toBe(false)
  })

  test("toggle renders a file and a second toggle brings its diff back, per file", () => {
    const rendered = createRenderedMarkdownState()
    rendered.toggle("README.md")
    rendered.toggle("docs/a.md")
    expect(rendered.has("README.md")).toBe(true)
    rendered.toggle("README.md")
    expect([...rendered.files()]).toEqual(["docs/a.md"])
  })

  test("clear shows every file as its diff again", () => {
    const rendered = createRenderedMarkdownState()
    rendered.toggle("README.md")
    rendered.clear()
    expect(rendered.files().size).toBe(0)
  })

  test("retain keeps only the files it is asked to, and leaves the rest drawn as their diff", () => {
    const rendered = createRenderedMarkdownState()
    rendered.toggle("README.md")
    rendered.toggle("docs/a.md")
    rendered.retain((filename) => filename === "docs/a.md")
    expect([...rendered.files()]).toEqual(["docs/a.md"])
  })

  test("rowsFor renders a file's text once and again only when the text changes", () => {
    const rendered = createRenderedMarkdownState()
    const first = rendered.rowsFor("README.md", "# a")
    expect(first.map((row) => row.text)).toEqual(["a"])
    expect(rendered.rowsFor("README.md", "# a")).toBe(first)
    expect(rendered.rowsFor("README.md", "# b").map((row) => row.text)).toEqual(["b"])
  })

  test("stale until a rendered file's loaded text has been rendered, and again once it changes", () => {
    const rendered = createRenderedMarkdownState()
    const texts = new Map<string, string>()
    const contentOf = (filename: string) => texts.get(filename)
    rendered.toggle("README.md")
    expect(rendered.stale(contentOf)).toBe(false)
    texts.set("README.md", "# a")
    expect(rendered.stale(contentOf)).toBe(true)
    rendered.rowsFor("README.md", "# a")
    expect(rendered.stale(contentOf)).toBe(false)
    texts.set("README.md", "# b")
    expect(rendered.stale(contentOf)).toBe(true)
  })

  test("a file shown as its diff is never stale", () => {
    const rendered = createRenderedMarkdownState()
    expect(rendered.stale(() => "# a")).toBe(false)
  })
})
