import { describe, expect, test } from "bun:test"
import { checkNodes, conversationNodes, firstChildOf, foldStep, leafNodes, parentOf, type RowNode } from "./pr-info-tree"
import type { FlatCheckItem, FlatConversationItem } from "./pr-info-items"
import type { PrCheck } from "../providers/github/types"
import type { MergePoint } from "./merge-status-model"

const node = (level: number, foldable = false, open = false): RowNode => ({ level, foldable, open })

// Merge status with the checks line open onto a failing check that shows
// one annotation, a passing check, and the conversations line folded.
const merge: RowNode[] = [
  node(0, true, true), // 0 checks line
  node(1, true, true), // 1 failing check, open
  node(2), //             2 annotation
  node(1), //             3 passing check
  node(0, true, false), //4 conversations line, folded
]

// A review open onto one thread, then a pr-comment whose body is open.
const conversation: RowNode[] = [
  node(0, true, true), // 0 review header
  node(1, true, false), //1 review thread
  node(0, true, true), // 2 pr-comment, open
  node(0), //             3 pending reviewer
]

const files = leafNodes(2)

describe("parentOf and firstChildOf", () => {
  test("climb to the nearest shallower row, or the header", () => {
    expect(parentOf(merge, 2)).toBe(1)
    expect(parentOf(merge, 3)).toBe(0)
    expect(parentOf(merge, 0)).toBe(-1)
    expect(parentOf(files, 1)).toBe(-1)
  })

  test("a child is the next row when it is deeper", () => {
    expect(firstChildOf(merge, 0)).toBe(1)
    expect(firstChildOf(merge, 2)).toBeNull()
    expect(firstChildOf(conversation, 2)).toBeNull()
  })
})

describe("foldStep on a folded header", () => {
  const step = (op: Parameters<typeof foldStep>[3]) => foldStep(merge, -1, false, op)
  test("l, zo and za open the section; h and zc do nothing", () => {
    expect(step("l")).toEqual({ openSection: true })
    expect(step("zo")).toEqual({ openSection: true })
    expect(step("za")).toEqual({ openSection: true })
    expect(step("h")).toBeNull()
    expect(step("zc")).toBeNull()
  })
})

describe("foldStep on an open header", () => {
  test("l steps onto row 0, or does nothing without rows", () => {
    expect(foldStep(merge, -1, true, "l")).toEqual({ cursor: 0 })
    expect(foldStep([], -1, true, "l")).toBeNull()
  })

  test("h, zc and za fold the section; zo does nothing", () => {
    for (const nodes of [merge, []]) {
      expect(foldStep(nodes, -1, true, "h")).toEqual({ closeSection: true })
      expect(foldStep(nodes, -1, true, "zc")).toEqual({ closeSection: true })
      expect(foldStep(nodes, -1, true, "za")).toEqual({ closeSection: true })
      expect(foldStep(nodes, -1, true, "zo")).toBeNull()
    }
  })
})

describe("foldStep on a folded row", () => {
  test("l, zo and za open it", () => {
    for (const op of ["l", "zo", "za"] as const) expect(foldStep(merge, 4, true, op)).toEqual({ openRow: 4 })
  })

  test("h climbs to the parent without folding it; zc folds the parent", () => {
    expect(foldStep(merge, 4, true, "h")).toEqual({ cursor: -1 })
    expect(foldStep(merge, 4, true, "zc")).toEqual({ closeSection: true })
    expect(foldStep(conversation, 1, true, "h")).toEqual({ cursor: 0 })
    expect(foldStep(conversation, 1, true, "zc")).toEqual({ closeRow: 0, cursor: 0 })
  })
})

describe("foldStep on an open row with a child", () => {
  test("l steps onto the child; h, zc and za fold it; zo does nothing", () => {
    expect(foldStep(merge, 1, true, "l")).toEqual({ cursor: 2 })
    for (const op of ["h", "zc", "za"] as const) expect(foldStep(merge, 1, true, op)).toEqual({ closeRow: 1, cursor: 1 })
    expect(foldStep(merge, 1, true, "zo")).toBeNull()
  })
})

describe("foldStep on an open row without child rows", () => {
  test("l does nothing; h, zc and za fold it", () => {
    expect(foldStep(conversation, 2, true, "l")).toBeNull()
    expect(foldStep(conversation, 2, true, "zo")).toBeNull()
    for (const op of ["h", "zc", "za"] as const) expect(foldStep(conversation, 2, true, op)).toEqual({ closeRow: 2, cursor: 2 })
  })
})

describe("foldStep on a leaf", () => {
  test("level 1: l and zo do nothing, h climbs, zc and za fold the parent", () => {
    expect(foldStep(merge, 3, true, "l")).toBeNull()
    expect(foldStep(merge, 3, true, "zo")).toBeNull()
    expect(foldStep(merge, 3, true, "h")).toEqual({ cursor: 0 })
    expect(foldStep(merge, 3, true, "zc")).toEqual({ closeRow: 0, cursor: 0 })
    expect(foldStep(merge, 3, true, "za")).toEqual({ closeRow: 0, cursor: 0 })
  })

  test("level 2: h climbs to the check, zc and za fold the check", () => {
    expect(foldStep(merge, 2, true, "l")).toBeNull()
    expect(foldStep(merge, 2, true, "h")).toEqual({ cursor: 1 })
    expect(foldStep(merge, 2, true, "zc")).toEqual({ closeRow: 1, cursor: 1 })
    expect(foldStep(merge, 2, true, "za")).toEqual({ closeRow: 1, cursor: 1 })
  })

  test("zc skips an enclosing row that is not an open fold", () => {
    const nodes = [node(0, false, true), node(1)]
    expect(foldStep(nodes, 1, true, "zc")).toEqual({ closeSection: true })
  })

  test("level 0: h climbs to the header, zc and za fold the section", () => {
    expect(foldStep(files, 1, true, "l")).toBeNull()
    expect(foldStep(files, 1, true, "zo")).toBeNull()
    expect(foldStep(files, 1, true, "h")).toEqual({ cursor: -1 })
    expect(foldStep(files, 1, true, "zc")).toEqual({ closeSection: true })
    expect(foldStep(files, 1, true, "za")).toEqual({ closeSection: true })
  })
})

describe("the section builders", () => {
  const failing = { id: 1, name: "test", status: "completed", conclusion: "failure" } as PrCheck
  const passing = { id: 2, name: "lint", status: "completed", conclusion: "success" } as PrCheck
  const point = (id: MergePoint["id"]) => ({ id, text: id }) as MergePoint

  test("checks: a line is open when rows follow it, a failing check when it is expanded", () => {
    const items: FlatCheckItem[] = [
      { kind: 'point', point: point('checks') },
      { kind: 'check', check: failing },
      { kind: 'annotation', check: failing, annotation: {} as never },
      { kind: 'check', check: passing },
      { kind: 'point', point: point('reviews') },
    ]
    expect(checkNodes(items, { checks: [failing, passing], threads: [] }, new Set([1]))).toEqual([
      node(0, true, true),
      node(1, true, true),
      node(2),
      node(1),
      node(0, false, false),
    ])
  })

  test("conversation: a review is open while its threads show", () => {
    const review = { id: "r1", threads: [] } as never
    const items: FlatConversationItem[] = [
      { type: 'review-header', data: review },
      { type: 'review-thread', data: { id: "t1" } as never, parentReview: review },
      { type: 'pr-comment', data: { id: 5 } as never },
      { type: 'pending-reviewer', data: ["ann"] },
    ]
    expect(conversationNodes(items, new Set(["5"]))).toEqual([
      node(0, true, true),
      node(1, true, false),
      node(0, true, true),
      node(0),
    ])
  })
})
