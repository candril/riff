import { test, expect, afterEach } from "bun:test"
import { bgAt, ints, mountJsx } from "../testing/frame"
import { theme } from "../theme"
import { DRAFT_INNER_WIDTH, DraftNotification } from "./DraftNotification"
import { draftNotificationModel } from "./notification-model"

let mounted: Awaited<ReturnType<typeof mountJsx>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const model = draftNotificationModel(
  {
    filename: "src/greet.ts",
    line: 14,
    startLine: 10,
    side: "RIGHT",
    bodyPreview: Array.from({ length: 40 }, (_, i) => `word${i}`).join(" "),
    mtimeMs: 0,
  },
  DRAFT_INNER_WIDTH
)

test("the notice is a 64-wide block on mantle with no border", async () => {
  mounted = await mountJsx(() => <DraftNotification model={model} />, { width: 70, height: 10 })
  const frame = await mounted.frame()

  expect(frame).not.toMatch(/[╭╮╰╯│─]/)
  const rows = frame.split("\n")
  // Padding row above, title, target, three clamped preview lines, hint.
  expect(rows[0]).toBe("")
  expect(rows.slice(1).map((r) => r.trim())).toEqual([
    "Claude drafted a comment",
    "src/greet.ts:10-14",
    ...model.preview,
    "Ctrl+p: copy or discard it",
  ])
  expect(model.preview).toHaveLength(3)
  expect(model.preview[2]!.endsWith("…")).toBe(true)
  expect(rows[1]!.indexOf("Claude")).toBe(2)

  const spans = mounted.setup.captureSpans()
  for (const [x, y] of [[0, 0], [1, 3], [63, 7], [30, 4]] as const) {
    expect(bgAt(spans, x, y)).toEqual(ints(theme.mantle))
  }
  expect(bgAt(spans, 64, 3)).not.toEqual(ints(theme.mantle))
  expect(bgAt(spans, 0, 8)).not.toEqual(ints(theme.mantle))
})
