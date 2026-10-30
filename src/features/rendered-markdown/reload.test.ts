import { describe, expect, test } from "bun:test"
import { parseDiff } from "../../utils/diff-parser"
import { createFileContentState } from "../file-content/state"
import { reloadRenderedFiles } from "./reload"
import { createRenderedMarkdownState } from "./state"

const DIFF = [
  "diff --git a/README.md b/README.md",
  "--- a/README.md",
  "+++ b/README.md",
  "@@ -1 +1,2 @@",
  " # a",
  "+b",
  "diff --git a/OLD.md b/OLD.md",
  "deleted file mode 100644",
  "--- a/OLD.md",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-# gone",
  "",
].join("\n")

function setup(load: (filename: string, content: ReturnType<typeof createFileContentState>) => void) {
  const renderedMarkdown = createRenderedMarkdownState()
  const fileContent = createFileContentState()
  const loaded: string[] = []
  const ctx = {
    files: () => parseDiff(DIFF),
    renderedMarkdown,
    fileContent,
    loadFileContent: async (filename: string) => {
      loaded.push(filename)
      load(filename, fileContent)
    },
  }
  return { ctx, renderedMarkdown, loaded }
}

describe("reloadRenderedFiles", () => {
  test("reads a rendered file's new version again, so it is drawn rendered after the reload", async () => {
    const { ctx, renderedMarkdown, loaded } = setup((filename, content) => content.set(filename, "# a\nb", "# a"))
    renderedMarkdown.toggle("README.md")
    await reloadRenderedFiles(ctx)
    expect(loaded).toEqual(["README.md"])
    expect(renderedMarkdown.has("README.md")).toBe(true)
  })

  test("turns the toggle off for a file the reloaded review deleted or dropped, which has no new version", async () => {
    const { ctx, renderedMarkdown, loaded } = setup((filename, content) => content.set(filename, "x", null))
    renderedMarkdown.toggle("OLD.md")
    renderedMarkdown.toggle("GONE.md")
    await reloadRenderedFiles(ctx)
    expect(loaded).toEqual([])
    expect([...renderedMarkdown.files()]).toEqual([])
  })

  test("turns the toggle off for a file whose new version could not be read, so the next gR renders it", async () => {
    const { ctx, renderedMarkdown } = setup((filename, content) => content.setError(filename, "boom"))
    renderedMarkdown.toggle("README.md")
    await reloadRenderedFiles(ctx)
    expect(renderedMarkdown.has("README.md")).toBe(false)
  })
})
