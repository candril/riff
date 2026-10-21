import { test, expect, describe } from "bun:test"
import { MarkdownRenderable } from "@opentui/core"
import type { ConversationRows } from "../components/pr-info-conversation-rows"
import type { DescriptionModel } from "../components/pr-info-description"
import type { PanelSection } from "../components/pr-info-panel-model"
import { ints } from "../testing/frame"
import { opened, dana, reviewers } from "../testing/conversation-rows"
import { section, usePrInfoPanelIsland } from "../testing/pr-info-panel-island"
import { theme } from "../theme"

const mountIsland = usePrInfoPanelIsland()

describe("the description", () => {
  const BODY = "Adds `greet`.\n\n- one\n- two"
  const description = (over: Partial<DescriptionModel> = {}): PanelSection[] => [
    section("description", {
      kind: "description",
      model: { body: { text: BODY, images: [] }, reactions: [], cursorLine: null, ...over },
    }),
  ]

  // The description's box, padding included, is 30 wide on a 34-wide screen,
  // read from the margin row above it.
  async function mountDescription() {
    const shown = await mountIsland({ width: 34, height: 20 })
    const at = (renders = 1) => shown.inside(() => shown.island.descriptionBox()!, 10, renders, 1)
    return { ...shown, at }
  }

  test("reads on the first frame after it is mounted", async () => {
    const { island, at } = await mountDescription()
    island.update({ sections: description() })
    expect((await at()).lines.slice(0, 5)).toEqual(["", "  Adds greet.", "", "  - one", "  - two"])
  })

  test("a push that only moves the cursor keeps the markdown body, and moves the cursor row", async () => {
    const { island, byId, at } = await mountDescription()
    island.update({ sections: description({ cursorLine: 0 }) })
    await at(2)
    const body = byId("pr-info-description")
    expect(body).toBeInstanceOf(MarkdownRenderable)

    island.update({ sections: description({ cursorLine: 2 }) })
    expect(byId("pr-info-description")).toBe(body)
    const { lines, bg, fg } = await at()
    expect(lines[3]).toBe("  - one")
    expect(bg(0, 1)).not.toEqual(ints(theme.surface1))
    expect(bg(0, 3)).toEqual(ints(theme.surface1))
    expect(bg(29, 3)).toEqual(ints(theme.surface1))
    expect(fg(4, 3)).not.toEqual(ints(theme.surface1))
  })

  test("updates changed text in place, in the same body", async () => {
    const { island, byId, at } = await mountDescription()
    island.update({ sections: description() })
    await at(2)
    const body = byId("pr-info-description")

    island.update({ sections: description({ body: { text: "Something else entirely.", images: [] } }) })
    expect(byId("pr-info-description")).toBe(body)
    expect((await at()).lines.slice(1, 3)).toEqual(["  Something else entirely.", ""])
  })

  test("clamps the cursor row to the last line it draws, and hides it with no cursor line", async () => {
    const { island, at } = await mountDescription()
    island.update({ sections: description({ cursorLine: 9 }) })
    await at(2)
    let { bg } = await at()
    expect(bg(0, 4)).toEqual(ints(theme.surface1))
    expect(bg(0, 5)).not.toEqual(ints(theme.surface1))

    island.update({ sections: description() })
    ;({ bg } = await at())
    for (const y of [1, 2, 3, 4]) expect(bg(0, y)).not.toEqual(ints(theme.surface1))
  })

  test("says there is no description, then names the pictures and draws the pills", async () => {
    const { island, at } = await mountDescription()
    island.update({ sections: description({ body: null, reactions: [{ text: "🚀 1", fg: theme.blue }] }) })
    await at(2)
    let { lines, fg } = await at()
    expect(lines.slice(1, 3)).toEqual(["  No description provided", "   🚀 1"])
    expect(fg(2, 1)).toEqual(ints(theme.overlay0))
    expect(fg(3, 2)).toEqual(ints(theme.blue))

    island.update({ sections: description({ body: { text: "", images: ["Login screen"] } }) })
    ;({ lines, fg } = await at())
    expect(lines.slice(1, 3)).toEqual(["  ▣ Login screen", ""])
    expect(fg(2, 1)).toEqual(ints(theme.sapphire))
  })
})

describe("the conversation", () => {
  const conversation = (rows: ConversationRows): PanelSection[] => [
    section("conversation", { kind: "conversation", rows }),
  ]

  // The conversation's box is 44 wide on a 50-wide screen.
  async function mountConversation() {
    const shown = await mountIsland({ width: 50, height: 30 })
    const at = (renders = 2) => shown.inside(() => shown.byId("pr-info-conversation"), 14, renders)
    return { ...shown, at }
  }

  test("a push that only moves the cursor keeps the markdown body it drew, and its text on the next render", async () => {
    const { island, byId, at } = await mountConversation()
    island.update({ sections: conversation(opened(true)) })
    await at()
    const body = byId("pr-comment-501")
    expect(body).toBeInstanceOf(MarkdownRenderable)

    island.update({ sections: conversation(opened(false)) })
    expect(byId("pr-comment-501")).toBe(body)
    const { lines, bg } = await at(1)
    expect(lines[2]).toBe("    Rename greet to welcome.")
    expect(lines[4]).toBe("    - one")
    expect(bg(0, 0)).not.toEqual(ints(theme.surface0))
    expect(bg(0, 9)).toEqual(ints(theme.surface0))
  })

  test("finds each row's drawn header past the body boxes between them", async () => {
    const { island, byId, at } = await mountConversation()
    island.update({ sections: conversation(opened(true)) })
    await at()
    const top = byId("pr-info-conversation").y
    expect(island.rowAt("conversation", 0)!.y - top).toBe(0)
    expect(island.rowAt("conversation", 1)!.y - top).toBe(9)
    expect(island.rowAt("conversation", 1)!.height).toBe(1)
    expect(island.rowAt("conversation", 2)).toBeUndefined()

    island.update({ sections: conversation({ rows: [reviewers(false)], note: null }) })
    await at()
    expect(island.rowAt("conversation", 0)!.y - top).toBe(1)
    expect(island.rowAt("conversation", 0)!.height).toBe(3)
  })

  test("drops a body whose row closed", async () => {
    const { island, root, at } = await mountConversation()
    island.update({ sections: conversation(opened(true)) })
    await at()
    island.update({ sections: conversation({ rows: [dana()], note: null }) })
    expect((await at()).frame).toBe("▶ @dana  a preview far too long for       6h")
    expect(root.findDescendantById("pr-comment-501")).toBeUndefined()
  })
})
