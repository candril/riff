import { test, expect, afterEach, describe } from "bun:test"
import { SyntaxStyle } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { PRInfoConversationView } from "./PRInfoConversationView"
import type { ConversationRows } from "./pr-info-conversation-rows"
import { dana, opened, reviewers } from "../testing/conversation-rows"
import { bgAt, fgAt, ints, mountJsx } from "../testing/frame"
import { colors, theme } from "../theme"

let mounted: { dispose: () => Promise<void> } | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
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
