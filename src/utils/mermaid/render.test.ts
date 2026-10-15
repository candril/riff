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

  test("participants are drawn again at the foot", () => {
    const diagram = drawn(`sequenceDiagram
      participant A as riff
      participant B as GitHub
      A->>B: fetch
      B-->>A: files`)

    const rows = diagram.split("\n")
    // The same three rows head and foot the lifelines, so a long exchange
    // still says who its columns are where it ends.
    expect(rows.slice(-3)).toEqual(rows.slice(0, 3))
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

describe("state diagrams", () => {
  test("start and end are dots, a state is a rounded box", () => {
    expect(drawn("stateDiagram-v2\n [*] --> Still\n Still --> [*]")).toBe(
      [
        "  ╭───╮",
        "  │ ● │",
        "  ╰───╯",
        "    │",
        "    ▼",
        "╭───────╮",
        "│ Still │",
        "╰───────╯",
        "    │",
        "    ▼",
        "  ╭───╮",
        "  │ ◉ │",
        "  ╰───╯",
      ].join("\n"),
    )
  })

  test("a transition back to the same state loops out of its side", () => {
    expect(drawn("stateDiagram-v2\n Busy --> Busy: poll")).toBe(
      ["╭──────╮", "│ Busy │─┐ poll", "│      │◀┘", "╰──────╯"].join("\n"),
    )
  })

  test("transitions between the same two states share one line", () => {
    const diagram = drawn(`stateDiagram-v2
      A --> B: one
      A --> B: two`)
    expect(diagram.match(/▼/g)).toHaveLength(1)
    expect(diagram).toContain("one / two")
  })

  test("every transition is a line of its own, with its label on the row it leaves", () => {
    const diagram = drawn(`stateDiagram-v2
      A --> B: the first, straight down
      A --> C: the second, round the side
      B --> C: the third`)
    const rows = diagram.split("\n")
    // Out of A's side on the row the label stands on; into C with its own head.
    expect(rows.find((row) => row.includes("the second"))).toMatch(/│─+┐\s+the second/)
    expect(diagram.match(/◀/g)).toHaveLength(1)
    expect(diagram.match(/▼/g)).toHaveLength(2)
    // No line meets another: nothing joins, nothing is lettered.
    expect(diagram).not.toMatch(/[├┤┬┴]/)
    expect(rows.some((row) => /^[a-z]  /.test(row))).toBe(false)
  })

  test("a transition back up the diagram runs round the left", () => {
    const diagram = drawn(`stateDiagram-v2
      state Working
      state check <<choice>>
      [*] --> check
      check --> Working
      Working --> check: ReportAax`)
    const rows = diagram.split("\n")
    const row = (text: string) => rows.findIndex((line) => line.includes(text))
    // Declared first, Working still comes after the choice that leads to it.
    expect(row("Working")).toBeGreaterThan(row("╱───╲"))
    expect(rows.find((row) => row.includes("ReportAax"))).toMatch(/ReportAax\s+└─+│/)
    expect(diagram).toContain("▶")
  })

  test("a state with more lines than label grows to give each its row", () => {
    const diagram = drawn(`stateDiagram-v2
      A --> B
      A --> End
      B --> End
      B --> C
      C --> End`)
    const arrivals = diagram.split("\n").filter((row) => row.includes("◀"))
    expect(arrivals).toHaveLength(2)
    expect(new Set(arrivals).size).toBe(2)
  })
})

describe("flowcharts and self links", () => {
  test("a node linked to itself is drawn, not hung on", () => {
    expect(drawn("graph TD\n A --> A")).toContain("↻")
  })
})

describe("what it cannot draw", () => {
  test("says so by name, and draws nothing", () => {
    const render = renderMermaid("classDiagram\n Animal <|-- Duck")
    expect(render.lines).toEqual([])
    expect(render.note).toBe("riff can't draw a classDiagram yet")
  })

  test("an empty block is empty, not a crash", () => {
    expect(renderMermaid("graph TD").lines).toEqual([])
    expect(renderMermaid("").lines).toEqual([])
  })
})

describe("er diagrams", () => {
  test("an entity is its name over a rule over its attributes in columns, and a relationship reads aloud", () => {
    const diagram = drawn(`erDiagram
      CUSTOMER ||--o{ ORDER : places
      CUSTOMER {
        string name PK
        int age
      }`)

    expect(diagram).toContain("│    CUSTOMER    │")
    expect(diagram).toContain("├────────────────┤")
    expect(diagram).toContain("│ string name PK │")
    expect(diagram).toContain("│ int    age     │")
    expect(diagram).toContain("1 places 0..n")
    expect(diagram).toContain("│ ORDER │")
    expect(renderMermaid("erDiagram\n A ||--|| B : has").kind).toBe("er")
  })
})
