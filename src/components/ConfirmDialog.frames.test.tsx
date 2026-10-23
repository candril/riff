import { test, expect, afterEach } from "bun:test"
import { bgAt, fgAt, ints, mountJsx } from "../testing/frame"
import { colors, theme } from "../theme"
import { ConfirmDialog } from "./ConfirmDialog"
import type { ConfirmDialogModel } from "./confirm-dialog-model"

/*
 * The dialog alone at the top left of an 80x24 screen: a padded mantle
 * header, the body on base, and a padded mantle footer, 50 cells wide.
 */

/* With a second answer it widens to 64 and adds the answer's key row and command to the body. */

let mounted: Awaited<ReturnType<typeof mountJsx>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const mount = (model: ConfirmDialogModel) => mountJsx(() => <ConfirmDialog model={model} />, { width: 80, height: 24 })

test("the header, message, details and Y/n hint each sit on their own padded row", async () => {
  mounted = await mount({ title: "Delete comment?", message: "This removes it on GitHub.", details: "Some details here" })
  expect(await mounted.frame()).toBe(
    [
      "",
      "  Delete comment?",
      "",
      "",
      "  This removes it on GitHub.",
      "",
      "  Some details here",
      "",
      "",
      "  Yes / no",
    ].join("\n")
  )

  const spans = mounted.setup.captureSpans()
  for (const y of [0, 1, 2, 8, 9, 10]) {
    expect(bgAt(spans, 0, y)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, 49, y)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, 50, y)).not.toEqual(ints(theme.mantle))
  }
  for (const y of [3, 4, 5, 6, 7]) {
    expect(bgAt(spans, 0, y)).toEqual(ints(theme.base))
    expect(bgAt(spans, 49, y)).toEqual(ints(theme.base))
    expect(bgAt(spans, 50, y)).not.toEqual(ints(theme.base))
  }
  expect(bgAt(spans, 0, 11)).not.toEqual(ints(theme.mantle))

  expect(fgAt(spans, 2, 1)).toEqual(ints(theme.yellow))
  expect(fgAt(spans, 2, 4)).toEqual(ints(theme.text))
  expect(fgAt(spans, 2, 6)).toEqual(ints(colors.textDim))
  expect(fgAt(spans, 2, 9)).toEqual(ints(theme.green))
  expect(fgAt(spans, 3, 9)).toEqual(ints(colors.textMuted))
  expect(fgAt(spans, 8, 9)).toEqual(ints(theme.red))
  expect(fgAt(spans, 9, 9)).toEqual(ints(colors.textMuted))
})

test("without details the body is only the message, with no gap left for them", async () => {
  mounted = await mount({ title: "Delete comment?", message: "This removes it on GitHub." })
  expect(await mounted.frame()).toBe(
    ["", "  Delete comment?", "", "", "  This removes it on GitHub.", "", "", "  Yes / no"].join("\n")
  )

  const spans = mounted.setup.captureSpans()
  expect(bgAt(spans, 0, 5)).toEqual(ints(theme.base))
  for (const y of [6, 7, 8]) expect(bgAt(spans, 0, y)).toEqual(ints(theme.mantle))
  expect(bgAt(spans, 0, 9)).not.toEqual(ints(theme.mantle))
})

test("a second answer shows its key, its label and its own command under the main one", async () => {
  mounted = await mount({
    title: "Squash and Merge",
    message: "owner/repo#1259 into main",
    details: "gh pr merge 1259 -R owner/repo --squash",
    alternative: { key: "d", label: "merge and delete the branch", details: "gh pr merge 1259 -R owner/repo --squash --delete-branch" },
  })
  expect(await mounted.frame()).toBe(
    [
      "",
      "  Squash and Merge",
      "",
      "",
      "  owner/repo#1259 into main",
      "",
      "  gh pr merge 1259 -R owner/repo --squash",
      "",
      "  d merge and delete the branch",
      "  gh pr merge 1259 -R owner/repo --squash --delete-branch",
      "",
      "",
      "  Yes / no",
    ].join("\n")
  )

  const spans = mounted.setup.captureSpans()
  for (const y of [3, 8, 9, 10]) {
    expect(bgAt(spans, 0, y)).toEqual(ints(theme.base))
    expect(bgAt(spans, 63, y)).toEqual(ints(theme.base))
    expect(bgAt(spans, 64, y)).not.toEqual(ints(theme.base))
  }
  for (const y of [11, 12, 13]) expect(bgAt(spans, 63, y)).toEqual(ints(theme.mantle))
  expect(fgAt(spans, 2, 8)).toEqual(ints(theme.yellow))
  expect(fgAt(spans, 4, 8)).toEqual(ints(colors.textMuted))
  expect(fgAt(spans, 2, 9)).toEqual(ints(colors.textDim))
})
