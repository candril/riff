import { describe, expect, test } from "bun:test"
import type { LineBlame } from "../../providers/blame/source"
import { closeBlamePeek, createBlamePeekState, openBlamePeek, settleBlamePeek, type BlamePeekSnapshot } from "./peek-state"

const empty: { blamePeek: BlamePeekSnapshot | null } = { blamePeek: null }
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

describe("the blame peek's factory", () => {
  test("starts closed", () => {
    const blamePeek = createBlamePeekState()
    expect(blamePeek.open()).toBe(false)
    expect(blamePeek.peek()).toBeNull()
  })

  test("opens loading and settles with the answer for its request", () => {
    const ready = createBlamePeekState()
    const request = ready.show(first)
    expect(ready.open()).toBe(true)
    expect(ready.peek()).toEqual({ target: first, request, status: "loading" })
    ready.settle(request, { result })
    expect(ready.peek()).toEqual({ target: first, request, status: "ready", result })

    const failed = createBlamePeekState()
    const asked = failed.show(first)
    failed.settle(asked, { message: "boom" })
    expect(failed.peek()).toEqual({ target: first, request: asked, status: "error", message: "boom" })
  })

  test("a slow answer for a peek closed and reopened on another line is dropped", () => {
    const blamePeek = createBlamePeekState()
    const stale = blamePeek.show(first)
    blamePeek.close()
    const current = blamePeek.show(second)
    blamePeek.settle(stale, { result })
    expect(blamePeek.peek()).toEqual({ target: second, request: current, status: "loading" })
    blamePeek.settle(current, { result })
    expect(blamePeek.peek()).toMatchObject({ target: second, status: "ready" })
  })

  test("an answer after the peek closed changes nothing", () => {
    const blamePeek = createBlamePeekState()
    const request = blamePeek.show(first)
    blamePeek.close()
    blamePeek.settle(request, { result })
    expect(blamePeek.open()).toBe(false)
    expect(blamePeek.peek()).toBeNull()
  })

  test("request numbers keep rising across a close and an open", () => {
    const blamePeek = createBlamePeekState()
    const one = blamePeek.show(first)
    blamePeek.close()
    const two = blamePeek.show(first)
    const three = blamePeek.show(second)
    expect(two).toBeGreaterThan(one)
    expect(three).toBeGreaterThan(two)
  })

  test("closing a closed peek leaves it closed", () => {
    const blamePeek = createBlamePeekState()
    blamePeek.close()
    expect(blamePeek.open()).toBe(false)
  })
})
