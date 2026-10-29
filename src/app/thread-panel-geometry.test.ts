import { describe, expect, test } from "bun:test"
import { createInitialState, openInlineCommentOverlay } from "../state"
import { composerColumns } from "../components/thread-rows-estimate"
import { threadPanelGeometry } from "./thread-panel-geometry"

const SCREEN = { width: 120, height: 24 }
const opened = (mode: "view" | "compose") =>
  openInlineCommentOverlay(createInitialState([], [], "test", ""), "src/greet.ts", 3, "RIGHT", mode)
const rows = (mode: "view" | "compose", draft: string) =>
  threadPanelGeometry(opened(mode), false, SCREEN, () => draft).budget.viewportRows

describe("the rows the thread window is chosen by", () => {
  test("give the composer the rows its draft takes, up to the textarea's limit", () => {
    const one = rows("compose", "a thought")
    expect(rows("compose", "one\ntwo\nthree\nfour")).toBe(one - 3)
    expect(rows("compose", Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n"))).toBe(one - 11)
  })

  test("count a long line by the rows it wraps to", () => {
    const width = threadPanelGeometry(opened("compose"), false, SCREEN, () => "").width
    expect(rows("compose", "x".repeat(width * 2))).toBeLessThan(rows("compose", "x"))
  })

  test("count a line of words by the rows its words wrap to, which can be more than its characters take", () => {
    const width = threadPanelGeometry(opened("compose"), false, SCREEN, () => "").width
    const word = "w".repeat(Math.floor(composerColumns(width) / 2) + 1)
    expect(rows("compose", [word, word, word].join(" "))).toBe(rows("compose", "x") - 2)
  })

  test("leave the composer out in view mode, whatever the textarea still holds", () => {
    expect(rows("view", "one\ntwo\nthree\nfour")).toBe(rows("view", ""))
    expect(rows("view", "")).toBeGreaterThan(rows("compose", ""))
  })

  test("give a picker the rows between the header and the composer, and none without a composer", () => {
    const room = (mode: "view" | "compose", draft: string) =>
      threadPanelGeometry(opened(mode), false, SCREEN, () => draft).pickerRoom
    expect(room("compose", "one\ntwo\nthree\nfour")).toBe(room("compose", "a thought")! - 3)
    expect(room("view", "a thought")).toBeNull()
    expect(threadPanelGeometry(opened("compose"), false, { width: 120, height: 6 }, () => "").pickerRoom).toBeNull()
  })
})
