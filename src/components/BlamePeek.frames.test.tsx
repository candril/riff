import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { createPeekIsland } from "../app/peek-island"
import { colors, theme } from "../theme"
import type { LineBlame } from "../providers/blame/source"
import { blamePeekModel, type BlamePeekStatus } from "./blame-peek-model"

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const NOW = Date.parse("2026-10-21T12:00:00Z")
const target = { path: "src/cart.ts", side: "head" as const, line: 42 }
const blame: LineBlame = {
  line: {
    kind: "commit",
    commit: {
      sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      shortSha: "a1b2c3d4",
      author: "Ada Lovelace",
      date: "2026-10-18T09:30:00Z",
      subject: "Round totals once, at checkout",
    },
  },
  pr: { number: 12, url: "https://github.com/o/r/pull/12" },
}

async function frame(status: BlamePeekStatus, size = { width: 100, height: 30 }) {
  let island: ReturnType<typeof createPeekIsland> | undefined
  const mount = await mountRenderable((renderer) => {
    const parent = new BoxRenderable(renderer, { width: "100%", height: "100%" })
    island = createPeekIsland(renderer, { id: "blame-peek-island" })
    parent.add(island.host)
    return parent
  }, size)
  mounted = {
    ...mount,
    dispose: async () => {
      island!.dispose()
      await mount.dispose()
    },
  }
  island!.update(blamePeekModel({ target, now: NOW, terminalWidth: size.width, terminalHeight: size.height, ...status }))
  return (await mounted.frame()).split("\n")
}

const spans = () => mounted!.setup.captureSpans()
const find = (rows: string[], text: string) => {
  const y = rows.findIndex((row) => row.includes(text))
  return { x: rows[y]?.indexOf(text) ?? -1, y }
}

const at = (col: number, text: string) => " ".repeat(col) + text
const blank = (count: number) => Array.from({ length: count }, () => "")

/** Every corner of the box on mantle, and the cells just outside it on the dimmed backdrop. */
function expectMantleBox(left: number, top: number, width: number, height: number) {
  const right = left + width - 1
  const bottom = top + height - 1
  for (const [x, y] of [[left, top], [right, top], [left, bottom], [right, bottom]] as const) {
    expect(bgAt(spans(), x, y)).toEqual(ints(theme.mantle))
  }
  const dim = bgAt(spans(), 0, 0)
  expect(dim).not.toEqual(ints(theme.mantle))
  expect(bgAt(spans(), left - 1, top)).toEqual(dim)
  expect(bgAt(spans(), right + 1, bottom)).toEqual(dim)
  expect(bgAt(spans(), left, top - 1)).toEqual(dim)
  expect(bgAt(spans(), right, bottom + 1)).toEqual(dim)
}

test("a blamed line names its commit, author, date, subject and PR on a mantle box", async () => {
  const rows = await frame({ status: "ready", result: blame })
  expect(rows).toEqual([
    ...blank(11),
    at(28, "src/cart.ts:42 head"),
    "",
    at(28, "a1b2c3d4 Ada Lovelace"),
    at(28, "2026-10-18 (3d ago)"),
    at(28, "Round totals once, at checkout"),
    at(28, "#12"),
    "",
    at(28, "go: open PR #12 · y: copy sha · Esc: close"),
  ])
  expectMantleBox(26, 10, 48, 10)
  expect(fgAt(spans(), 28, 11)).toEqual(ints(colors.primary))
  expect(fgAt(spans(), 43, 11)).toEqual(ints(theme.green))
  expect(fgAt(spans(), 28, 13)).toEqual(ints(theme.peach))
  expect(fgAt(spans(), 37, 13)).toEqual(ints(colors.text))
  expect(fgAt(spans(), 28, 14)).toEqual(ints(colors.textDim))
  expect(fgAt(spans(), 28, 16)).toEqual(ints(theme.blue))
})

test("on a 60 by 24 terminal the box still fits and keeps every row", async () => {
  const rows = await frame({ status: "ready", result: blame }, { width: 60, height: 24 })
  for (const text of ["a1b2c3d4 Ada Lovelace", "2026-10-18 (3d ago)", "Round totals once, at checkout", "#12", "go: open PR #12 · y: copy sha · Esc: close"]) {
    expect(rows.some((row) => row.includes(text))).toBe(true)
  }
  const sha = find(rows, "a1b2c3d4")
  expect(sha.x).toBe(8)
  expectMantleBox(6, sha.y - 3, 48, 10)
})

test("while blame is read the peek says so", async () => {
  const rows = await frame({ status: "loading" })
  const loading = find(rows, "Reading blame…")
  expect(loading.y).toBeGreaterThan(0)
  expect(rows.some((row) => row.trim() === "Esc: close")).toBe(true)
  expect(fgAt(spans(), loading.x, loading.y)).toEqual(ints(colors.textDim))
  expect(bgAt(spans(), loading.x, loading.y)).toEqual(ints(theme.mantle))
})

test("a failure shows the tool's message in red", async () => {
  const rows = await frame({ status: "error", message: "jj: Revision `trunk()` doesn't exist" }, { width: 60, height: 24 })
  const message = find(rows, "jj: Revision `trunk()` doesn't exist")
  expect(message.y).toBeGreaterThan(0)
  expect(fgAt(spans(), message.x, message.y)).toEqual(ints(theme.red))
  expect(rows.some((row) => row.trim() === "Esc: close")).toBe(true)
})
