import { describe, expect, test } from "bun:test"
import type { KnownRepo } from "./known-repos"
import { clipboardReference, parsePrReference, resolvePrReference } from "./reference"

describe("parsePrReference", () => {
  const full = { kind: "full", owner: "acme", repo: "web.app", number: 12 }

  test.each([
    ["12", { kind: "number", number: 12 }],
    ["#12", { kind: "number", number: 12 }],
    ["  #12\n", { kind: "number", number: 12 }],
    ["web#12", { kind: "named", repo: "web", number: 12 }],
    ["web/12", { kind: "named", repo: "web", number: 12 }],
    ["acme/web.app#12", full],
    ["acme/web.app/12", full],
    ["acme/web.app/pull/12", full],
    ["gh:acme/web.app#12", full],
    ["https://github.com/acme/web.app/pull/12", full],
    ["https://github.com/acme/web.app/pull/12/files?w=1#diff-abc", full],
    ["github.com/acme/web.app/pull/12", full],
    ["<https://github.com/acme/web.app/pull/12>", full],
    ['"acme/web.app#12"', full],
  ])("reads %j", (text, expected) => {
    expect(parsePrReference(text)).toEqual(expected as never)
  })

  test.each(["", "abc", "https://github.com/acme/web/issues/12", "a/b/c/12", "12a", "web#"])("refuses %j", (text) => {
    expect(parsePrReference(text)).toBeNull()
  })
})

describe("resolvePrReference", () => {
  const iso: KnownRepo = { owner: "acme", repo: "isomorph", alias: "ISO" }
  const fork: KnownRepo = { owner: "fork", repo: "isomorph" }
  const lane: KnownRepo = { owner: "me", repo: "lane" }
  const known = [iso, fork, lane]
  const here = { owner: "me", repo: "riff" }

  test("an id is the current repo's", () => {
    expect(resolvePrReference({ kind: "number", number: 5 }, { current: here, known })).toEqual({ kind: "open", ...here, number: 5 })
  })

  test("an id outside a repo asks among every known repo", () => {
    expect(resolvePrReference({ kind: "number", number: 5 }, { current: null, known })).toEqual({ kind: "ask", number: 5, repos: known })
  })

  test("an id with nowhere to look says what to paste", () => {
    expect(resolvePrReference({ kind: "number", number: 5 }, { current: null, known: [] })).toEqual({
      kind: "unknown",
      message: "Not in a repository, so paste owner/repo#5",
    })
  })

  test("a name matches regardless of case, and an alias counts", () => {
    const open = { kind: "open", owner: "me", repo: "lane", number: 5 }
    expect(resolvePrReference({ kind: "named", repo: "LANE", number: 5 }, { current: null, known })).toEqual(open as never)
    expect(resolvePrReference({ kind: "named", repo: "iso", number: 5 }, { current: null, known })).toEqual({
      kind: "open",
      owner: "acme",
      repo: "isomorph",
      number: 5,
    })
  })

  test("a name two repos answer to asks between them", () => {
    expect(resolvePrReference({ kind: "named", repo: "isomorph", number: 5 }, { current: null, known })).toEqual({
      kind: "ask",
      number: 5,
      repos: [iso, fork],
    })
  })

  test("the current repo answers to its name, and is not listed twice", () => {
    expect(resolvePrReference({ kind: "named", repo: "riff", number: 5 }, { current: here, known })).toEqual({ kind: "open", ...here, number: 5 })
    expect(resolvePrReference({ kind: "named", repo: "lane", number: 5 }, { current: lane, known })).toEqual({ kind: "open", ...lane, number: 5 })
  })

  test("a name nothing answers to says what to paste", () => {
    expect(resolvePrReference({ kind: "named", repo: "nope", number: 5 }, { current: null, known })).toEqual({
      kind: "unknown",
      message: "No known repo is called nope, so paste owner/nope#5",
    })
  })
})

describe("clipboardReference", () => {
  const context = { current: null, known: [{ owner: "acme", repo: "isomorph", alias: "ISO" }] }

  test.each([
    ["https://github.com/acme/web/pull/7/files", "https://github.com/acme/web/pull/7/files"],
    ["  acme/web#7\n", "acme/web#7"],
    ["ISO#7", "ISO#7"],
    ["isomorph/7", "isomorph/7"],
    ["#7", "#7"],
    ["7", "7"],
  ])("takes %j", (clipboard, expected) => {
    expect(clipboardReference(clipboard, context)).toBe(expected)
  })

  test.each([
    [null],
    [""],
    ["some words"],
    ["docs/12"],
    ["https://github.com/acme/web/issues/7"],
    ["see\nhttps://github.com/acme/web/pull/7"],
    [`${"long ".repeat(70)}https://github.com/acme/web/pull/7`],
  ])("leaves %j", (clipboard) => {
    expect(clipboardReference(clipboard, context)).toBeNull()
  })

  test("an id with nowhere to look is not offered", () => {
    expect(clipboardReference("7", { current: null, known: [] })).toBeNull()
  })
})
