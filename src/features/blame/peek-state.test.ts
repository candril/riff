import { describe, expect, test } from "bun:test"
import type { LineBlame } from "../../providers/blame/source"
import { closeBlamePeek, openBlamePeek, settleBlamePeek, type BlamePeekState } from "./peek-state"

const empty: { blamePeek: BlamePeekState | null } = { blamePeek: null }
const first = { path: "a.ts", side: "head" as const, line: 3 }
const second = { path: "b.ts", side: "base" as const, line: 9 }
const result: LineBlame = { line: { kind: "uncommitted" }, pr: null }

describe("the blame peek's state", () => {
  test("opens loading and settles with the answer for its request", () => {
    const open = openBlamePeek(empty, first, 1)
    expect(open.blamePeek).toEqual({ target: first, request: 1, status: "loading" })
    expect(settleBlamePeek(open, 1, { result }).blamePeek).toEqual({ target: first, request: 1, status: "ready", result })
    expect(settleBlamePeek(open, 1, { message: "boom" }).blamePeek).toEqual({
      target: first,
      request: 1,
      status: "error",
      message: "boom",
    })
  })

  test("a slow answer for a peek closed and reopened on another line is dropped", () => {
    const reopened = openBlamePeek(closeBlamePeek(openBlamePeek(empty, first, 1)), second, 2)
    expect(settleBlamePeek(reopened, 1, { result })).toBe(reopened)
    expect(settleBlamePeek(reopened, 2, { result }).blamePeek).toMatchObject({ target: second, status: "ready" })
  })

  test("an answer after the peek closed changes nothing", () => {
    const closed = closeBlamePeek(openBlamePeek(empty, first, 1))
    expect(closed.blamePeek).toBeNull()
    expect(settleBlamePeek(closed, 1, { result })).toBe(closed)
  })
})
