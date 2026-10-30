import { afterEach, expect, test } from "bun:test"
import { MERMAID_README_DIFF, mermaidReadmeRendered } from "../testing/mermaid-readme"
import { mountUnified } from "../testing/unified-frame"

let mounted: Awaited<ReturnType<typeof mountUnified>> | null = null
afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

test("a rendered README's mermaid block is drawn as its diagram, above the paragraph after it", async () => {
  mounted = await mountUnified({ raw: MERMAID_README_DIFF, height: 30, mappingOptions: mermaidReadmeRendered() })
  const rows = (await mounted.frame()).split("\n")
  const rowOf = (text: string) => rows.findIndex((row) => row.includes(text))

  expect(rowOf("│ Start │")).toBeGreaterThan(-1)
  expect(rowOf("│ Done │")).toBeGreaterThan(-1)
  const frame = rows.join("\n")
  expect(frame).not.toContain("```mermaid")
  expect(frame).not.toContain("graph TD")
  expect(rowOf("Flow")).toBeLessThan(rowOf("│ Start │"))
  expect(rowOf("│ Start │")).toBeLessThan(rowOf("│ Done │"))
  expect(rowOf("After the chart.")).toBeGreaterThan(rowOf("│ Done │"))
})
