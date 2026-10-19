import { test, expect, afterEach, describe } from "bun:test"
import { MarkdownRenderable, SyntaxStyle } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createPrInfoConversationIsland, type PrInfoConversationIsland } from "./pr-info-conversation"
import { PRInfoConversationView } from "../components/PRInfoConversationView"
import type { ConversationRow, ConversationRows } from "../components/pr-info-conversation-rows"
import { bgAt, fgAt, ints, mountJsx, mountRenderable } from "../testing/frame"
import { colors, theme } from "../theme"

let mounted: { dispose: () => Promise<void> } | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const BODY = "Rename `greet` to **welcome**.\n\n- one\n- two"

const dana = (over: Partial<Extract<ConversationRow, { kind: "item" }>> = {}): ConversationRow => ({
  kind: "item",
  key: "501",
  selected: false,
  indent: 0,
  header: [
    { text: "▶ ", fg: theme.subtext0, flex: "fixed" },
    { text: "@dana", fg: theme.sapphire, flex: "fixed" },
    { text: "  a preview far too long for the row it sits on", fg: theme.subtext1, flex: "grow" },
    { text: "    6h", fg: theme.overlay0, flex: "fixed" },
  ],
  body: [],
  ...over,
})

const opened = (selected: boolean): ConversationRows => ({
  rows: [
    dana({
      selected,
      header: [
        { text: "▼ ", fg: theme.subtext0, flex: "fixed" },
        { text: "@dana", fg: selected ? theme.blue : theme.sapphire, flex: "fixed" },
        { text: "", fg: theme.subtext1, flex: "grow" },
        { text: "    6h", fg: theme.overlay0, flex: "fixed" },
      ],
      body: [
        { kind: "markdown", key: "pr-comment-501", id: "pr-comment-501", text: BODY, images: ["screenshot"], indent: 4 },
        { kind: "reactions", key: "501:reactions", indent: 4, pills: [{ text: "👍 2", fg: theme.subtext1 }] },
      ],
    }),
    dana({ key: "502", selected: !selected }),
  ],
  note: null,
})

const reviewers = (selected: boolean, label?: string): ConversationRow => ({
  kind: "reviewers",
  key: "pending-frank,grace",
  selected,
  ...(label ? { label } : {}),
  header: [
    { text: "○ ", fg: theme.yellow, flex: "fixed" },
    { text: "awaiting review (2)", fg: theme.yellow, flex: "fixed" },
  ],
  names: [
    { text: "@frank", fg: theme.sapphire },
    { text: "@grace", fg: theme.sapphire },
  ],
  namesIndent: 4,
})

function View(props: { model: ConversationRows }) {
  const renderer = useRenderer()
  const markdown = { syntaxStyle: SyntaxStyle.fromStyles({}, renderer.nativeScene) }
  return (
    <box flexDirection="column">
      <PRInfoConversationView model={props.model} markdown={markdown} />
    </box>
  )
}

async function draw(model: ConversationRows, { width = 40, height = 12 } = {}) {
  const screen = await mountJsx(() => <View model={model} />, { width, height })
  mounted = screen
  const lines = (await screen.frame()).split("\n")
  return { lines, spans: screen.setup.captureSpans() }
}

describe("the conversation view", () => {
  test("squeezes a long preview so the time keeps its place at the row's end", async () => {
    const { lines, spans } = await draw({ rows: [dana()], note: null })
    expect(lines[0]).toBe("▶ @dana  a preview far too long       6h")
    expect(fgAt(spans, 2, 0)).toEqual(ints(theme.sapphire))
    expect(fgAt(spans, 38, 0)).toEqual(ints(theme.overlay0))
  })

  test("puts a flash label in front of a row, and of the reviewers' header", async () => {
    const short = dana({ label: "sd", header: dana().header.map((cell) => (cell.flex === "grow" ? { ...cell, text: "  hi" } : cell)) })
    const { lines, spans } = await draw({ rows: [short, reviewers(false, "a")], note: null })
    expect(lines[0]).toBe("sd ▶ @dana  hi                        6h")
    expect(lines[2]).toBe("a ○ awaiting review (2)")
    expect(fgAt(spans, 0, 0)).toEqual(ints(colors.flashLabel))
    expect(fgAt(spans, 3, 0)).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, 0, 2)).toEqual(ints(colors.flashLabel))
  })

  test("draws the reviewers as one block under its header, all of it on surface0 when selected", async () => {
    const { lines, spans } = await draw({ rows: [reviewers(true)], note: null })
    expect(lines).toEqual(["", "○ awaiting review (2)", "    @frank", "    @grace"])
    for (const y of [1, 2, 3]) expect(bgAt(spans, 39, y)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, 4, 2)).toEqual(ints(theme.sapphire))
  })

  test("draws the note alone when there is nothing to list", async () => {
    const { lines, spans } = await draw({ rows: [], note: "No comments" })
    expect(lines).toEqual(["No comments"])
    expect(fgAt(spans, 0, 0)).toEqual(ints(theme.overlay0))
  })

  test("opens a row onto its markdown, readable on the first frame, its pictures and its pills", async () => {
    const { lines, spans } = await draw(opened(true), { height: 14 })
    expect(lines.slice(0, 10)).toEqual([
      "▼ @dana                               6h",
      "",
      "    Rename greet to welcome.",
      "",
      "    - one",
      "    - two",
      "    ▣ screenshot",
      "",
      "     👍 2",
      "▶ @dana  a preview far too long       6h",
    ])
    expect(bgAt(spans, 0, 0)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, 4, 6)).toEqual(ints(theme.sapphire))
  })

  test("draws a body that was only a picture as the picture's name alone", async () => {
    const model = opened(false)
    const row = model.rows[0]!
    if (row.kind === "item") row.body = [{ kind: "markdown", key: "m", id: "m", text: "", images: ["screenshot"], indent: 4 }]
    const { lines } = await draw(model)
    expect(lines.slice(0, 4)).toEqual(["▼ @dana                               6h", "", "    ▣ screenshot", ""])
  })
})

async function mountIsland(height = 14) {
  let island!: PrInfoConversationIsland
  const screen = await mountRenderable((renderer) => {
    island = createPrInfoConversationIsland(renderer, {
      markdown: { syntaxStyle: SyntaxStyle.fromStyles({}, renderer.nativeScene) },
    })
    return island.host
  }, { width: 44, height })
  mounted = {
    dispose: async () => {
      island.dispose()
      await screen.dispose()
    },
  }
  return { island, screen }
}

describe("the conversation island", () => {
  test("a push that only moves the cursor keeps the markdown body it drew, and its text on the next render", async () => {
    const { island, screen } = await mountIsland()
    island.update(opened(true))
    await screen.frame()
    const root = screen.setup.renderer.root
    const body = root.findDescendantById("pr-comment-501")
    expect(body).toBeInstanceOf(MarkdownRenderable)

    island.update(opened(false))
    expect(root.findDescendantById("pr-comment-501")).toBe(body!)
    await screen.setup.renderOnce()
    const lines = screen.setup.captureCharFrame().split("\n")
    expect(lines[2]!.trimEnd()).toBe("    Rename greet to welcome.")
    expect(lines[4]!.trimEnd()).toBe("    - one")
    const spans = screen.setup.captureSpans()
    expect(bgAt(spans, 0, 0)).not.toEqual(ints(theme.surface0))
    expect(bgAt(spans, 0, 9)).toEqual(ints(theme.surface0))
  })

  test("finds each row's drawn header past the body boxes between them", async () => {
    const { island, screen } = await mountIsland()
    island.update(opened(true))
    await screen.frame()
    expect(island.rowAt(0)!.y).toBe(0)
    expect(island.rowAt(1)!.y).toBe(9)
    expect(island.rowAt(1)!.height).toBe(1)
    expect(island.rowAt(2)).toBeUndefined()

    island.update({ rows: [reviewers(false)], note: null })
    await screen.frame()
    expect(island.rowAt(0)!.y).toBe(1)
    expect(island.rowAt(0)!.height).toBe(3)
  })

  test("drops a body whose row closed", async () => {
    const { island, screen } = await mountIsland()
    island.update(opened(true))
    await screen.frame()
    island.update({ rows: [dana()], note: null })
    expect(await screen.frame()).toBe("▶ @dana  a preview far too long for       6h")
    expect(screen.setup.renderer.root.findDescendantById("pr-comment-501")).toBeUndefined()
  })
})
