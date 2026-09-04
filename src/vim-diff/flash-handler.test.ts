import { describe, expect, test } from "bun:test"
import { FlashHandler, type FlashRegion } from "./flash-handler"
import { createFlashState, type FlashState } from "./flash-state"
import type { DiffLineMapping } from "./line-mapping"
import type { VimCursorState } from "./types"
import { createCursorState } from "./cursor-state"

/**
 * Minimal stand-in for the mapping: every line is a context line whose
 * content comes from the table.
 */
function fakeMapping(lines: string[]): DiffLineMapping {
  return {
    getLine: (i: number) => (lines[i] === undefined ? undefined : { type: "context" }),
    getLineContent: (i: number) => lines[i] ?? "",
  } as unknown as DiffLineMapping
}

function harness(lines: string[], cursor: { line: number; col: number } = { line: 0, col: 0 }) {
  let flashState: FlashState = createFlashState()
  let vimState: VimCursorState = { ...createCursorState(), ...cursor }
  let jumpsRecorded = 0
  const region: FlashRegion = {
    lines: lines.map((_, i) => i),
    startCol: 0,
    endCol: 200,
  }

  const handler = new FlashHandler({
    getMapping: () => fakeMapping(lines),
    getFlashState: () => flashState,
    setFlashState: (state) => { flashState = state },
    getCursor: () => vimState,
    setCursor: (line, col) => { vimState = { ...vimState, line, col } },
    getVisibleRegion: () => region,
    recordJump: () => { jumpsRecorded++ },
    onUpdate: () => {},
  })

  return {
    handler,
    type: (chars: string) => { for (const char of chars) handler.handleChar(char) },
    get state() { return flashState },
    get cursor() { return vimState },
    get jumpsRecorded() { return jumpsRecorded },
  }
}

describe("FlashHandler", () => {
  test("typing narrows the pattern and labels every visible match", () => {
    const h = harness(["const a = 1", "let value = 2", "const b = 3"])
    h.handler.start()
    h.type("co")

    expect(h.state.pattern).toBe("co")
    expect(h.state.matches.map((m) => m.line)).toEqual([0, 2])
    expect(h.state.matches.every((m) => m.label !== null)).toBe(true)
  })

  test("pressing a label jumps to the match start and leaves flash mode", () => {
    const h = harness(["const a = 1", "let value = 2", "const b = 3"])
    h.handler.start()
    h.type("co")

    const target = h.state.matches[1]!
    h.handler.handleChar(target.label!)

    expect(h.cursor.line).toBe(2)
    expect(h.cursor.col).toBe(0)
    expect(h.state.active).toBe(false)
    expect(h.jumpsRecorded).toBe(1)
  })

  test("matching is case-insensitive", () => {
    const h = harness(["Const A = 1"])
    h.handler.start()
    h.type("const")

    expect(h.state.matches).toHaveLength(1)
  })

  test("only code lines are labelled", () => {
    const lines = ["const a = 1", "const b = 2"]
    const mapping = {
      getLine: (i: number) => ({ type: i === 0 ? "file-header" : "context" }),
      getLineContent: (i: number) => lines[i] ?? "",
    } as unknown as DiffLineMapping

    let flashState: FlashState = createFlashState()
    const handler = new FlashHandler({
      getMapping: () => mapping,
      getFlashState: () => flashState,
      setFlashState: (state) => { flashState = state },
      getCursor: () => createCursorState(),
      setCursor: () => {},
      getVisibleRegion: () => ({ lines: [0, 1], startCol: 0, endCol: 200 }),
      recordJump: () => {},
      onUpdate: () => {},
    })

    handler.start()
    handler.handleChar("c")

    expect(flashState.matches.map((m) => m.line)).toEqual([1])
  })

  test("backspace un-types, and on an empty pattern leaves flash mode", () => {
    const h = harness(["const a = 1"])
    h.handler.start()
    h.type("co")
    h.handler.handleBackspace()

    expect(h.state.pattern).toBe("c")
    expect(h.state.active).toBe(true)

    h.handler.handleBackspace()
    expect(h.state.pattern).toBe("")
    expect(h.state.active).toBe(true)

    h.handler.handleBackspace()
    expect(h.state.active).toBe(false)
  })

  test("cancel leaves the cursor where it was", () => {
    const h = harness(["const a = 1", "const b = 2"], { line: 1, col: 4 })
    h.handler.start()
    h.type("const")
    h.handler.cancel()

    expect(h.cursor.line).toBe(1)
    expect(h.cursor.col).toBe(4)
    expect(h.state.active).toBe(false)
    expect(h.jumpsRecorded).toBe(0)
  })

  test("matches outside the visible region are not labelled", () => {
    let flashState: FlashState = createFlashState()
    const lines = ["const a = 1", "const b = 2", "const c = 3"]
    const handler = new FlashHandler({
      getMapping: () => fakeMapping(lines),
      getFlashState: () => flashState,
      setFlashState: (state) => { flashState = state },
      getCursor: () => createCursorState(),
      setCursor: () => {},
      getVisibleRegion: () => ({ lines: [1], startCol: 0, endCol: 200 }),
      recordJump: () => {},
      onUpdate: () => {},
    })

    handler.start()
    handler.handleChar("c")

    expect(flashState.matches.map((m) => m.line)).toEqual([1])
  })
})
