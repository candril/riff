import { test, expect, describe } from "bun:test"
import { parseMermaid } from "./parse"
import type { FlowchartDiagram, SequenceDiagram } from "./types"

function flowchart(source: string): FlowchartDiagram {
  const diagram = parseMermaid(source)
  if (diagram.kind !== "flowchart") throw new Error(`not a flowchart: ${diagram.kind}`)
  return diagram
}

function sequence(source: string): SequenceDiagram {
  const diagram = parseMermaid(source)
  if (diagram.kind !== "sequence") throw new Error(`not a sequence: ${diagram.kind}`)
  return diagram
}

describe("flowcharts", () => {
  test("reads nodes, edges and the direction", () => {
    const diagram = flowchart(`flowchart LR
      A[Start] --> B(Middle)
      B --> C{Done?}`)

    expect(diagram.direction).toBe("LR")
    expect(diagram.nodes).toEqual([
      { id: "A", label: ["Start"], shape: "rect" },
      { id: "B", label: ["Middle"], shape: "round" },
      { id: "C", label: ["Done?"], shape: "decision" },
    ])
    expect(diagram.edges).toEqual([
      { from: "A", to: "B", label: undefined, style: "solid", arrow: true },
      { from: "B", to: "C", label: undefined, style: "solid", arrow: true },
    ])
  })

  test("defaults to top-down, and `graph` is the same thing", () => {
    expect(flowchart("graph\n A --> B").direction).toBe("TD")
    expect(flowchart("graph TB\n A --> B").direction).toBe("TD")
  })

  test("takes an edge label written either way", () => {
    const piped = flowchart("graph TD\n A -->|yes| B")
    expect(piped.edges[0]!.label).toBe("yes")

    const inline = flowchart("graph TD\n A -- no --> B")
    expect(inline.edges[0]!.label).toBe("no")
  })

  test("keeps the line style and whether the edge points anywhere", () => {
    const diagram = flowchart(`graph TD
      A --> B
      B -.-> C
      C ==> D
      D --- E`)

    expect(diagram.edges.map((edge) => [edge.style, edge.arrow])).toEqual([
      ["solid", true],
      ["dotted", true],
      ["thick", true],
      ["solid", false],
    ])
  })

  test("chains and fans out", () => {
    const chained = flowchart("graph TD\n A --> B --> C")
    expect(chained.edges).toEqual([
      { from: "A", to: "B", label: undefined, style: "solid", arrow: true },
      { from: "B", to: "C", label: undefined, style: "solid", arrow: true },
    ])

    const fanned = flowchart("graph TD\n A --> B & C")
    expect(fanned.edges.map((edge) => edge.to)).toEqual(["B", "C"])
  })

  test("a label set once survives a later bare mention", () => {
    const diagram = flowchart(`graph TD
      A[Start] --> B
      B --> A`)
    expect(diagram.nodes.find((node) => node.id === "A")!.label).toEqual(["Start"])
  })

  test("breaks a label on <br>", () => {
    const diagram = flowchart('graph TD\n A["First<br/>Second"] --> B')
    expect(diagram.nodes[0]!.label).toEqual(["First", "Second"])
  })

  test("reads past styling, and says when it flattened a subgraph", () => {
    const diagram = flowchart(`graph TD
      %% a comment
      subgraph one [Group]
      A --> B
      end
      style A fill:#f9f
      classDef big font-size:20px
      click A "https://x.test"`)

    expect(diagram.edges).toHaveLength(1)
    expect(diagram.notes).toEqual(["subgraphs flattened"])
  })

  test("takes semicolons as statement ends", () => {
    const diagram = flowchart("graph TD; A-->B; B-->C;")
    expect(diagram.edges).toHaveLength(2)
  })
})

describe("sequence diagrams", () => {
  test("reads participants in order, declared or not", () => {
    const diagram = sequence(`sequenceDiagram
      participant A as Alice
      A->>B: Hello
      B-->>A: Hi`)

    expect(diagram.participants).toEqual([
      { id: "A", label: "Alice" },
      { id: "B", label: "B" },
    ])
  })

  test("reads a message's direction, text and line style", () => {
    const diagram = sequence(`sequenceDiagram
      A->>B: Ask
      B-->>A: Answer`)

    expect(diagram.events).toEqual([
      { kind: "message", from: "A", to: "B", label: "Ask", style: "solid", arrow: "head" },
      { kind: "message", from: "B", to: "A", label: "Answer", style: "dotted", arrow: "head" },
    ])
  })

  test("keeps notes and block markers", () => {
    const diagram = sequence(`sequenceDiagram
      loop every day
      A->>B: Ping
      end
      Note over A,B: they are friends`)

    expect(diagram.events[0]).toEqual({ kind: "block", label: "loop every day" })
    expect(diagram.events[2]).toEqual({ kind: "block", label: "end" })
    expect(diagram.events[3]).toEqual({
      kind: "note",
      over: ["A", "B"],
      label: "they are friends",
    })
  })
})

describe("state diagrams", () => {
  test("states, a choice and both ends of [*] become a flowchart", () => {
    const diagram = parseMermaid(`stateDiagram-v2
      state "Working<br/>busy" as W
      state pick <<choice>>
      [*] --> pick: Start
      pick --> W: otherwise<br/>send it
      W --> [*]`)
    if (diagram.kind !== "flowchart") throw new Error(diagram.kind)

    expect(diagram.direction).toBe("TD")
    expect(diagram.nodes.find((node) => node.id === "W")).toEqual({
      id: "W",
      label: ["Working", "busy"],
      shape: "round",
    })
    expect(diagram.nodes.find((node) => node.id === "pick")?.shape).toBe("decision")
    expect(diagram.edges).toEqual([
      { from: "[*] start", to: "pick", label: "Start", style: "solid", arrow: true },
      { from: "pick", to: "W", label: "otherwise · send it", style: "solid", arrow: true },
      { from: "W", to: "[*] end", label: undefined, style: "solid", arrow: true },
    ])
  })

  test("a description names a state, and direction turns the diagram", () => {
    const diagram = parseMermaid(`stateDiagram-v2
      direction LR
      Idle : Waiting for input
      Idle --> Busy`)
    if (diagram.kind !== "flowchart") throw new Error(diagram.kind)

    expect(diagram.direction).toBe("LR")
    expect(diagram.nodes[0]!.label).toEqual(["Waiting for input"])
  })

  test("notes and composite states are left out, and said to be", () => {
    const diagram = parseMermaid(`stateDiagram-v2
      state Outer {
        A --> B
      }
      note right of A
        a note
      end note
      note left of B : short`)
    if (diagram.kind !== "flowchart") throw new Error(diagram.kind)

    expect(diagram.notes).toEqual(["composite states flattened", "notes left out"])
    expect(diagram.nodes.map((node) => node.id)).toEqual(["Outer", "A", "B"])
  })
})

describe("everything else", () => {
  test("names the diagram type it cannot read", () => {
    expect(parseMermaid("classDiagram\n Animal <|-- Duck")).toEqual({
      kind: "unsupported",
      type: "classDiagram",
    })
    expect(parseMermaid("pie title Pets\n \"Dogs\" : 386")).toEqual({
      kind: "unsupported",
      type: "pie",
    })
  })
})
