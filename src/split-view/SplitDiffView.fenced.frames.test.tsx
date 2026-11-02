import { afterEach, expect, test } from "bun:test"
import { fgAt, ints, mountSplit } from "../testing/split-frame"
import { theme } from "../theme"
import { parseHighlights } from "../vim-diff/file-parses"

const DOC = [
  "#### Body (`ChangeDisplayNameFamilyRequest`)",
  "",
  "```ts",
  "{",
  "  AccountHolder: familyOwnerId       // AAX keys a family by its owner",
  "  FamilyName: familyName",
  "  RequestHeader: AAXSource.Frontend",
  "}",
  "```",
].join("\n")

const DIFF = [
  "diff --git a/doc.md b/doc.md",
  "new file mode 100644",
  "index 0000000..2222222",
  "--- /dev/null",
  "+++ b/doc.md",
  "@@ -0,0 +1,9 @@",
  ...DOC.split("\n").map((line) => `+${line}`),
  "",
].join("\n")

let mounted: Awaited<ReturnType<typeof mountSplit>> | null = null
afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

test("a fenced ts block in a markdown diff takes typescript's colours, its fences stay green", async () => {
  mounted = await mountSplit({
    raw: DIFF,
    width: 160,
    height: 20,
    parse: parseHighlights,
    fileVersions: new Map([["doc.md", { new: DOC, old: null }]]),
  })
  const sapphire = ints(theme.sapphire)

  const cellOf = (rows: string[], text: string) => {
    const y = rows.findIndex((row) => row.includes(text))
    return { x: rows[y]!.indexOf(text), y }
  }
  let rows = (await mounted.frame()).split("\n")
  for (let tries = 0; tries < 200; tries++) {
    const holder = cellOf(rows, "AccountHolder")
    if (fgAt(mounted.setup.captureSpans(), holder.x, holder.y)?.join() === sapphire.join()) break
    await new Promise((resolve) => setTimeout(resolve, 10))
    rows = (await mounted.frame()).split("\n")
  }

  const spans = mounted.setup.captureSpans()
  const holder = cellOf(rows, "AccountHolder")
  const comment = cellOf(rows, "// AAX")
  const type = cellOf(rows, "AAXSource")
  const fence = cellOf(rows, "```ts")
  expect(holder.x).toBeGreaterThanOrEqual(80)
  expect(fgAt(spans, holder.x, holder.y)).toEqual(sapphire)
  expect(fgAt(spans, comment.x, comment.y)).toEqual(ints(theme.overlay0))
  expect(fgAt(spans, type.x, type.y)).toEqual(ints(theme.yellow))
  for (const cell of [holder, comment, type]) expect(fgAt(spans, cell.x, cell.y)).not.toEqual(ints(theme.green))
  expect(fgAt(spans, fence.x, fence.y)).toEqual(ints(theme.green))
})
