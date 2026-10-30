import { afterEach, expect, test } from "bun:test"
import { renderMarkdown } from "../features/rendered-markdown/render"
import { mountSplit } from "../testing/split-frame"

const README = ["# shop", "", "Intro", "", "## Shipping", "", "- fast", "- cheap"].join("\n")

const DIFF = [
  "diff --git a/README.md b/README.md",
  "index 1111111..2222222 100644",
  "--- a/README.md",
  "+++ b/README.md",
  "@@ -1,3 +1,8 @@",
  " # shop",
  " ",
  " Intro",
  "+",
  "+## Shipping",
  "+",
  "+- fast",
  "+- cheap",
  "",
].join("\n")

const WIDTH = 160
const NEW_HALF = WIDTH / 2

let mounted: Awaited<ReturnType<typeof mountSplit>> | null = null
afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

test("a rendered README fills the new half, and the old half of its rows stays empty", async () => {
  mounted = await mountSplit({
    raw: DIFF,
    width: WIDTH,
    height: 30,
    mappingOptions: {
      outsideDiff: true,
      fileContents: new Map([["README.md", README]]),
      renderedFiles: new Map([["README.md", renderMarkdown(README)]]),
    },
  })
  const rows = (await mounted.frame()).split("\n")

  for (const text of ["Shipping", "• fast", "• cheap", "Intro"]) {
    const drawn = rows.filter((row) => row.includes(text))
    expect(drawn).toHaveLength(1)
    const row = drawn[0]!
    expect(row.indexOf(text)).toBeGreaterThanOrEqual(NEW_HALF)
    expect(row.lastIndexOf(text)).toBe(row.indexOf(text))
    expect(row.slice(0, NEW_HALF).trim()).toBe("")
  }
  expect(rows.join("\n")).not.toContain("## Shipping")
})
