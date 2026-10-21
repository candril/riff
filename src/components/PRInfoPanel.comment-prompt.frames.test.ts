import { test, expect, describe } from "bun:test"
import { theme } from "../theme"
import { bgAt, fgAt, ints } from "../testing/frame"
import { find, fullPr, usePrInfoPanel } from "../testing/pr-info-panel"

// The `gC` prompt: a modal over the whole panel, opened and restyled by
// whatever its frame follower pushes from state.prInfoPanel.commentInput*.

const mount = usePrInfoPanel()

const PROMPT_TEXTS = ["Add PR Comment", "Esc to cancel", "Enter to submit"]

describe("the PR comment prompt", () => {
  test("draws nothing while closed", async () => {
    const { lines } = await mount({ prepare: (p) => p.updateCommentInput(false, "", false, null) })
    const screen = lines.join("\n")
    for (const text of PROMPT_TEXTS) expect(screen).not.toContain(text)
  })

  test("opened empty: a title with Esc right-aligned in the box, the placeholder and how to submit", async () => {
    const { lines, spans } = await mount({ prepare: (p) => p.updateCommentInput(true, "", false, null) })

    const [titleX, titleY] = find(lines, "Add PR Comment")
    const [escX, escY] = find(lines, "Esc to cancel")
    expect(escY).toBe(titleY)
    // 60 wide with 2 columns of padding on either side.
    const boxX = titleX - 2
    expect(escX + "Esc to cancel".length).toBe(boxX + 58)
    expect(bgAt(spans, boxX, titleY)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, boxX + 59, titleY)).toEqual(ints(theme.mantle))
    expect(fgAt(spans, titleX, titleY)).toEqual(ints(theme.text))
    expect(fgAt(spans, escX, escY)).toEqual(ints(theme.overlay0))

    const [placeholderX, placeholderY] = find(lines, "Type your comment...")
    expect(placeholderY).toBe(titleY + 2)
    expect(placeholderX).toBe(titleX + 1)
    expect(fgAt(spans, placeholderX, placeholderY)).toEqual(ints(theme.overlay0))
    expect(bgAt(spans, placeholderX, placeholderY)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, titleX, placeholderY)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, boxX + 57, placeholderY)).toEqual(ints(theme.surface0))

    const [statusX, statusY] = find(lines, "Enter to submit")
    expect([statusX, statusY]).toEqual([titleX, placeholderY + 2])
    expect(fgAt(spans, statusX, statusY)).toEqual(ints(theme.overlay0))
  })

  test("with text shows it in the text colour, without the placeholder", async () => {
    const { lines, spans } = await mount({ prepare: (p) => p.updateCommentInput(true, "hello", false, null) })
    expect(lines.join("\n")).not.toContain("Type your comment...")
    const [x, y] = find(lines, "hello")
    expect(fgAt(spans, x, y)).toEqual(ints(theme.text))
    expect(bgAt(spans, x, y)).toEqual(ints(theme.surface0))
  })

  test("says it is submitting in yellow, an error in red, and submitting over an error", async () => {
    const loading = await mount({ prepare: (p) => p.updateCommentInput(true, "hi", true, null) })
    expect(fgAt(loading.spans, ...find(loading.lines, "Submitting..."))).toEqual(ints(theme.yellow))
    expect(loading.lines.join("\n")).not.toContain("Enter to submit")

    const failed = await mount({ prepare: (p) => p.updateCommentInput(true, "hi", false, "boom") })
    expect(fgAt(failed.spans, ...find(failed.lines, "boom"))).toEqual(ints(theme.red))
    expect(failed.lines.join("\n")).not.toContain("Enter to submit")

    const both = await mount({ prepare: (p) => p.updateCommentInput(true, "hi", true, "boom") })
    expect(fgAt(both.spans, ...find(both.lines, "Submitting..."))).toEqual(ints(theme.yellow))
    expect(both.lines.join("\n")).not.toContain("boom")
  })

  test("closed again, gives the sections back", async () => {
    const plain = await mount()
    const { panel, mounted } = await mount({ prepare: (p) => p.updateCommentInput(true, "hello", false, null) })
    panel.updateCommentInput(false, "hello", false, null)
    const lines = (await mounted.frame()).split("\n")
    const screen = lines.join("\n")
    for (const text of PROMPT_TEXTS) expect(screen).not.toContain(text)
    expect(screen).not.toContain("hello")
    expect(lines).toEqual(plain.lines)
    expect(mounted.setup.captureSpans()).toEqual(plain.spans)
  })

  test("stays open with its text across a rebuild of the sections", async () => {
    const { panel, mounted } = await mount({ prepare: (p) => p.updateCommentInput(true, "hello", false, null) })
    panel.setActiveSection("files")
    panel.toggleSection()
    panel.setPrInfo(fullPr())
    const lines = (await mounted.frame()).split("\n")
    expect(lines.join("\n")).toContain("Add PR Comment")
    expect(fgAt(mounted.setup.captureSpans(), ...find(lines, "hello"))).toEqual(ints(theme.text))
    expect(lines.join("\n")).toContain("Enter to submit")
  })
})
