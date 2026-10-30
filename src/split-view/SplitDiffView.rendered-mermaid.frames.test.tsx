import { afterEach, expect, test } from "bun:test"
import { MERMAID_README_DIFF, mermaidReadmeRendered } from "../testing/mermaid-readme"
import { mountSplit } from "../testing/split-frame"

const WIDTH = 160
const NEW_HALF = WIDTH / 2

let mounted: Awaited<ReturnType<typeof mountSplit>> | null = null
afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

test("a rendered README's mermaid block is drawn as its diagram in the new half, above the paragraph after it", async () => {
  mounted = await mountSplit({ raw: MERMAID_README_DIFF, width: WIDTH, height: 30, mappingOptions: mermaidReadmeRendered() })
  const rows = (await mounted.frame()).split("\n")
  const rowOf = (text: string) => rows.findIndex((row) => row.includes(text))

  for (const label of ["│ Start │", "│ Done │"]) {
    expect(rowOf(label)).toBeGreaterThan(-1)
    expect(rows[rowOf(label)]!.indexOf(label)).toBeGreaterThanOrEqual(NEW_HALF)
  }
  const frame = rows.join("\n")
  expect(frame).not.toContain("```mermaid")
  expect(frame).not.toContain("graph TD")
  expect(rowOf("Flow")).toBeLessThan(rowOf("│ Start │"))
  expect(rowOf("│ Start │")).toBeLessThan(rowOf("│ Done │"))
  expect(rowOf("After the chart.")).toBeGreaterThan(rowOf("│ Done │"))
})
