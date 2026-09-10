import { test, expect, describe } from "bun:test"
import { renderMermaid } from "./index"

function drawn(source: string): string {
  const render = renderMermaid(source)
  return render.lines.join("\n")
}

describe("flowcharts", () => {
  test("a chain runs down the page", () => {
    expect(drawn("graph TD\n A[One] --> B[Two]")).toBe(
      [
        "┌─────┐",
        "│ One │",
        "└─────┘",
        "   │",
        "   ▼",
        "┌─────┐",
        "│ Two │",
        "└─────┘",
      ].join("\n"),
    )
  })

  test("LR lays the same chain across it", () => {
    expect(drawn("flowchart LR\n A[One] --> B[Two]")).toBe(
      ["┌─────┐  ┌─────┐", "│ One │─▶│ Two │", "└─────┘  └─────┘"].join("\n"),
    )
  })

  test("a branch splits and its labels sit by the arms", () => {
    const diagram = drawn(`graph TD
      A{Ready?} -->|yes| B[Go]
      A -->|no| C[Wait]`)

    expect(diagram).toContain("╱")
    expect(diagram).toContain("│ yes")
    expect(diagram).toContain("│ no")
    // One turn, two arms.
    expect(diagram).toContain("┴")
    expect(diagram.match(/▼/g)).toHaveLength(2)
  })

  test("branches that meet again join on one row", () => {
    const diagram = drawn(`graph TD
      A[Start] --> B[Left]
      A --> C[Right]
      B --> D[End]
      C --> D`)
    expect(diagram.match(/┴/g)?.length ?? 0).toBeGreaterThanOrEqual(1)
    expect(diagram).toContain("End")
  })

  test("a link against the flow goes round the outside", () => {
    const diagram = drawn(`graph TD
      A[Try] --> B[Fail]
      B --> A`)

    // Out of Fail's side, up the lane, and back into Try from the right.
    expect(diagram).toContain("◀")
    const rows = diagram.split("\n")
    expect(rows[rows.length - 1]).not.toContain("▼")
  })

  test("an undirected link has no head", () => {
    expect(drawn("graph TD\n A --- B")).not.toContain("▼")
  })

  test("a label broken with <br> makes the box taller", () => {
    const rows = drawn('graph TD\n A["First<br/>Second"]').split("\n")
    expect(rows).toHaveLength(4)
    expect(rows[1]).toContain("First")
    expect(rows[2]).toContain("Second")
  })

  test("says when it flattened a subgraph", () => {
    const render = renderMermaid("graph TD\n subgraph S\n A --> B\n end")
    expect(render.note).toBe("subgraphs flattened")
    expect(render.lines.length).toBeGreaterThan(0)
  })
})

describe("sequence diagrams", () => {
  test("participants head their lifelines, messages run between them", () => {
    const diagram = drawn(`sequenceDiagram
      participant A as riff
      participant B as GitHub
      A->>B: fetch
      B-->>A: files`)

    const rows = diagram.split("\n")
    expect(rows[0]).toBe("┌──────┐      ┌────────┐")
    expect(rows[1]).toBe("│ riff │      │ GitHub │")
    // Solid out, dotted back.
    expect(diagram).toContain("▶")
    expect(diagram).toContain("╌")
    expect(diagram).toContain("◀")
  })

  test("a message to oneself loops out and back", () => {
    const diagram = drawn("sequenceDiagram\n A->>A: think")
    expect(diagram).toContain("┐")
    expect(diagram).toContain("◀")
    expect(diagram).toContain("think")
  })

  test("a note is a box over the lifelines it covers", () => {
    const diagram = drawn(`sequenceDiagram
      A->>B: hi
      Note over A,B: both know`)
    expect(diagram).toContain("│ both know │")
  })

  test("loop and end are rules across the diagram", () => {
    const diagram = drawn(`sequenceDiagram
      loop every minute
      A->>B: poll
      end`)
    expect(diagram).toContain("╌ loop every minute ╌")
    expect(diagram).toContain("╌ end ╌")
  })
})

describe("what it cannot draw", () => {
  test("says so by name, and draws nothing", () => {
    const render = renderMermaid("stateDiagram-v2\n [*] --> Still")
    expect(render.lines).toEqual([])
    expect(render.note).toBe("riff can't draw a stateDiagram-v2 yet")
  })

  test("an empty block is empty, not a crash", () => {
    expect(renderMermaid("graph TD").lines).toEqual([])
    expect(renderMermaid("").lines).toEqual([])
  })
})
