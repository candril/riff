import { afterEach, describe, expect, test } from "bun:test"
import { BLAME_CELLS } from "../components/blame-column-model"
import type { BlameColumnState } from "../features/blame/column-state"
import type { BlameLine, FileBlame } from "../providers/blame/types"
import { TWO_FILES } from "../testing/diffs"
import { screenOf } from "../testing/screen"
import { mountSplit, type MountSplitOptions } from "../testing/split-frame"

const commit = (shortSha: string, author: string): BlameLine => ({
  kind: "commit",
  commit: { sha: `${shortSha}${"0".repeat(32)}`, shortSha, author, date: "2026-01-01T00:00:00Z", subject: "s" },
})
const HEAD = commit("aaaa1111", "Ada")
const BASE = commit("cccc3333", "Linus")
const every = (line: BlameLine, count: number): FileBlame => [undefined, ...Array.from({ length: count }, () => line)]

const ready = (head: FileBlame | null, base: FileBlame | null): BlameColumnState => ({ status: "ready", head, base })

let mounted: Awaited<ReturnType<typeof mountSplit>> | null = null
afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

async function rowsWith(options: MountSplitOptions) {
  mounted = await mountSplit(options)
  await mounted.frame()
  return screenOf(mounted).rows
}

describe("split's blame column", () => {
  test("the left half names base commits and the right half head commits, each code BLAME_CELLS further right", async () => {
    const plain = await rowsWith({ raw: TWO_FILES, width: 160 })
    await mounted!.dispose()
    const rows = await rowsWith({
      raw: TWO_FILES,
      width: 160,
      blameColumns: new Map([["src/greet.ts", ready(every(HEAD, 5), every(BASE, 4))]]),
    })
    const half = 80
    const left = rows.map((row) => row.slice(0, half).trimEnd())
    const right = rows.map((row) => row.slice(half).trimEnd())
    expect(left[1]).toBe("  cccc3333 Linus      1 export function greet(name: string) {")
    expect(right[1]).toBe("  aaaa1111 Ada        1 export function greet(name: string) {")
    // One commit on each side, so the run runs on down both halves unnamed.
    expect(left.slice(2, 6).every((row) => !row.includes("cccc3333") && !row.includes("aaaa1111"))).toBe(true)
    expect(right.slice(2, 6).every((row) => !row.includes("aaaa1111") && !row.includes("cccc3333"))).toBe(true)
    expect(rows[1]!.indexOf("export")).toBe(plain[1]!.indexOf("export") + BLAME_CELLS)
    // farewell.ts has no column, so its rows are as they were.
    const farewell = plain.findIndex((row) => row.includes("src/farewell.ts"))
    expect(rows.slice(farewell)).toEqual(plain.slice(farewell))
  })
})
