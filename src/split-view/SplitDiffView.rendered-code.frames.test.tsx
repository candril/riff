import { afterEach, expect, test } from "bun:test"
import type { SimpleHighlight } from "@opentui/core"
import { SYNTAX_PALETTE } from "../diff-rows/syntax-palette"
import { renderMarkdown } from "../features/rendered-markdown/render"
import { fgAt, ints, mountSplit } from "../testing/split-frame"
import { theme } from "../theme"

const README = ["# shop", "", "```ts", "const typed = 1", "```", "", "```", "const plain = 2", "```"].join("\n")

const DIFF = [
  "diff --git a/README.md b/README.md",
  "new file mode 100644",
  "index 0000000..2222222",
  "--- /dev/null",
  "+++ b/README.md",
  "@@ -0,0 +1,9 @@",
  ...README.split("\n").map((line) => `+${line}`),
  "",
].join("\n")

// Colours every `const` as a keyword, as the typescript parser would.
async function parseConst(text: string, filetype: string): Promise<SimpleHighlight[] | null> {
  if (filetype !== "typescript") return null
  return [...text.matchAll(/\bconst\b/g)].map((match) => [match.index, match.index + 5, "keyword"])
}

let mounted: Awaited<ReturnType<typeof mountSplit>> | null = null
afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

test("a ts block in a rendered README takes its language's colours, a block with no language stays green", async () => {
  mounted = await mountSplit({
    raw: DIFF,
    width: 160,
    height: 20,
    parse: parseConst,
    mappingOptions: {
      outsideDiff: true,
      fileContents: new Map([["README.md", README]]),
      renderedFiles: new Map([["README.md", renderMarkdown(README)]]),
    },
  })
  const keyword = ints(SYNTAX_PALETTE.keyword!.fg!)
  const green = ints(theme.green)

  const cellOf = (rows: string[], text: string) => {
    const y = rows.findIndex((row) => row.includes(text))
    return { x: rows[y]!.indexOf(text), y }
  }
  let rows = (await mounted.frame()).split("\n")
  for (let tries = 0; tries < 20; tries++) {
    const typed = cellOf(rows, "const typed")
    if (fgAt(mounted.setup.captureSpans(), typed.x, typed.y)?.join() === keyword.join()) break
    await new Promise((resolve) => setTimeout(resolve, 10))
    rows = (await mounted.frame()).split("\n")
  }

  const spans = mounted.setup.captureSpans()
  const typed = cellOf(rows, "const typed")
  const plain = cellOf(rows, "const plain")
  expect(typed.x).toBeGreaterThanOrEqual(80)
  expect(fgAt(spans, typed.x, typed.y)).toEqual(keyword)
  expect(fgAt(spans, typed.x + 4, typed.y)).toEqual(keyword)
  expect(fgAt(spans, typed.x, typed.y)).not.toEqual(green)
  expect(fgAt(spans, plain.x, plain.y)).toEqual(green)
})
