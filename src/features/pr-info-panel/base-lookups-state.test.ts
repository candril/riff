import { describe, expect, test } from "bun:test"
import { createBaseLookupsState } from "./base-lookups-state"
import type { StackInfo } from "../../utils/stack"

const STACK: StackInfo = { basePr: { number: 7, title: "base" }, status: "current", behindBy: 0 }

describe("the base lookups' state", () => {
  test("starts unheard, with nothing held", () => {
    const lookups = createBaseLookupsState()
    expect(lookups.stack()).toBeNull()
    expect(lookups.stackHeard()).toBe(false)
    expect(lookups.behindBy()).toBeNull()
  })

  test("takes an answer on the latest ticket and marks the stack heard", () => {
    const lookups = createBaseLookupsState()
    expect(lookups.answerStack(lookups.askStack(), null)).toBe(true)
    expect(lookups.stackHeard()).toBe(true)
    expect(lookups.answerBehindBy(lookups.askBehindBy(), 3)).toBe(true)
    expect(lookups.behindBy()).toBe(3)
  })

  test("drops an answer a newer ask has overtaken", () => {
    const lookups = createBaseLookupsState()
    const older = lookups.askStack()
    const newer = lookups.askStack()
    expect(lookups.answerStack(newer, STACK)).toBe(true)
    expect(lookups.answerStack(older, null)).toBe(false)
    expect(lookups.stack()).toEqual(STACK)

    const olderBehind = lookups.askBehindBy()
    lookups.askBehindBy()
    expect(lookups.answerBehindBy(olderBehind, 9)).toBe(false)
    expect(lookups.behindBy()).toBeNull()
  })

  test("the tickets are counted per lookup", () => {
    const lookups = createBaseLookupsState()
    const stackTicket = lookups.askStack()
    lookups.askBehindBy()
    expect(lookups.answerStack(stackTicket, STACK)).toBe(true)
  })

  test("forgets what it heard and drops answers still out", () => {
    const lookups = createBaseLookupsState()
    lookups.answerStack(lookups.askStack(), STACK)
    lookups.answerBehindBy(lookups.askBehindBy(), "failed")
    const stackOut = lookups.askStack()
    const behindOut = lookups.askBehindBy()
    lookups.forget()
    expect(lookups.stack()).toBeNull()
    expect(lookups.stackHeard()).toBe(false)
    expect(lookups.behindBy()).toBeNull()
    expect(lookups.answerStack(stackOut, STACK)).toBe(false)
    expect(lookups.answerBehindBy(behindOut, 1)).toBe(false)
    expect(lookups.stackHeard()).toBe(false)
  })
})
