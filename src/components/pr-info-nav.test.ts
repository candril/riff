import { describe, expect, test } from "bun:test"
import type { PRInfoPanelSection } from "../state"
import { ALL_SECTIONS, type FlatConversationItem } from "./pr-info-items"
import {
  bottomTarget,
  collapseAll,
  collapseSection,
  collapseContent,
  collapsePoint,
  cycleSection,
  cycleSectionToEnd,
  expandAll,
  expandContent,
  expandPoint,
  expandSection,
  flashJumpNav,
  flashTargets,
  initialNav,
  moveCursor,
  navAt,
  reactionTargetOf,
  readerSections,
  restoreNav,
  setFilter,
  stepNav,
  toggleCheck,
  toggleContent,
  togglePoint,
  withCursor,
  withFilter,
  type PrInfoNav,
  type SectionCounts,
} from "./pr-info-nav"

const ROWS: Record<PRInfoPanelSection, number> = {
  description: 4,
  previews: 0,
  checks: 2,
  conversation: 3,
  files: 5,
  commits: 2,
}
const counts = (rows: Partial<Record<PRInfoPanelSection, number>> = {}): SectionCounts =>
  (section) => rows[section] ?? ROWS[section]

function nav(over: Partial<PrInfoNav> = {}): PrInfoNav {
  return { ...initialNav(), ...over }
}

const open = (...sections: PRInfoPanelSection[]) => new Set<PRInfoPanelSection>(sections)

describe("initialNav", () => {
  test("starts on the description's header with only the description open, the merge status's checks line ready open", () => {
    expect(initialNav()).toEqual({
      activeSection: 'description',
      cursorIndex: -1,
      expandedSections: open('description'),
      expandedThreads: new Set(),
      expandedContent: new Set(),
      expandedCheckIds: new Set(),
      expandedPoints: new Set(['checks']),
      filterOpened: open(),
      filter: "",
    })
  })

  test("opens exactly the sections it is handed, in a set of its own", () => {
    const saved = open('files', 'conversation')
    const nav = initialNav(saved)
    expect(nav.expandedSections).toEqual(open('files', 'conversation'))
    saved.add('commits')
    expect(nav.expandedSections).toEqual(open('files', 'conversation'))
  })
})

describe("moveCursor", () => {
  test("stops at the header and at the last row, handing back the same nav", () => {
    const top = nav({ activeSection: 'files', cursorIndex: -1 })
    expect(moveCursor(top, -1, counts())).toBe(top)
    const bottom = nav({ activeSection: 'files', cursorIndex: 4 })
    expect(moveCursor(bottom, 1, counts())).toBe(bottom)
  })

  test("clamps a jump past either end", () => {
    expect(moveCursor(nav({ activeSection: 'files', cursorIndex: 2 }), 10, counts()).cursorIndex).toBe(4)
    expect(moveCursor(nav({ activeSection: 'files', cursorIndex: 2 }), -10, counts()).cursorIndex).toBe(-1)
  })

  test("stays on the header of an empty section", () => {
    const empty = nav({ activeSection: 'previews' })
    expect(moveCursor(empty, 1, counts())).toBe(empty)
  })
})

describe("stepNav", () => {
  test("goes from the last row down onto the next section's header", () => {
    const from = nav({ activeSection: 'checks', cursorIndex: 1, expandedSections: open('checks') })
    expect(stepNav(from, 1, counts())).toMatchObject({ activeSection: 'description', cursorIndex: -1 })
  })

  test("moves within an open section", () => {
    const from = nav({ activeSection: 'checks', cursorIndex: 0, expandedSections: open('checks') })
    expect(stepNav(from, 1, counts())).toMatchObject({ activeSection: 'checks', cursorIndex: 1 })
  })

  test("goes from a header up onto the open section above's last row", () => {
    const from = nav({ activeSection: 'conversation', expandedSections: open('previews', 'conversation') })
    expect(stepNav(from, -1, counts({ previews: 2 }))).toMatchObject({ activeSection: 'previews', cursorIndex: 1 })
  })

  test("goes up onto the header of a folded or empty section", () => {
    const belowFolded = nav({ activeSection: 'conversation', expandedSections: open() })
    expect(stepNav(belowFolded, -1, counts({ previews: 2 }))).toMatchObject({ activeSection: 'previews', cursorIndex: -1 })
    const belowEmpty = nav({ activeSection: 'conversation', expandedSections: open('previews') })
    expect(stepNav(belowEmpty, -1, counts())).toMatchObject({ activeSection: 'previews', cursorIndex: -1 })
  })

  test("does not wrap at either end of the panel", () => {
    expect(stepNav(nav({ activeSection: 'checks' }), -1, counts())).toBeNull()
    const last = nav({ activeSection: 'commits', cursorIndex: 1, expandedSections: open('commits') })
    expect(stepNav(last, 1, counts())).toBeNull()
  })
})

describe("cycleSection", () => {
  test("wraps both ways onto a header", () => {
    expect(cycleSection(nav({ activeSection: 'checks' }), -1)).toMatchObject({ activeSection: 'commits', cursorIndex: -1 })
    expect(cycleSection(nav({ activeSection: 'commits', cursorIndex: 1 }), 1))
      .toMatchObject({ activeSection: 'checks', cursorIndex: -1 })
  })
})

describe("cycleSectionToEnd", () => {
  test("lands on the last row of an open section with rows", () => {
    const from = nav({ activeSection: 'conversation', expandedSections: open('previews') })
    expect(cycleSectionToEnd(from, -1, counts({ previews: 2 }))).toMatchObject({ activeSection: 'previews', cursorIndex: 1 })
  })

  test("lands on the header of an open empty section", () => {
    const from = nav({ activeSection: 'conversation', expandedSections: open('previews') })
    expect(cycleSectionToEnd(from, -1, counts())).toMatchObject({ activeSection: 'previews', cursorIndex: -1 })
  })

  test("lands on the header of a folded section", () => {
    const from = nav({ activeSection: 'conversation', expandedSections: open() })
    expect(cycleSectionToEnd(from, -1, counts({ previews: 2 }))).toMatchObject({ activeSection: 'previews', cursorIndex: -1 })
  })
})

describe("setFilter", () => {
  test("hands back the same nav for the same filter", () => {
    const filtered = nav({ filter: "x" })
    expect(setFilter(filtered, "x", counts())).toBe(filtered)
  })

  test("opens the sections it matches in, but never touches the description", () => {
    const closed = setFilter(nav({ expandedSections: open() }), "x", counts())
    expect(closed.expandedSections).toEqual(open('checks', 'conversation', 'files', 'commits'))
    const described = setFilter(nav({ expandedSections: open('description') }), "x", counts())
    expect(described.expandedSections.has('description')).toBe(true)
  })

  test("leaves a section with no matches folded and clamps the cursor into what is left", () => {
    const from = nav({ activeSection: 'files', cursorIndex: 4, expandedSections: open() })
    const next = setFilter(from, "x", counts({ files: 2, checks: 0 }))
    expect(next.expandedSections.has('checks')).toBe(false)
    expect(next.cursorIndex).toBe(1)
    expect(next.filter).toBe("x")
  })

  test("folds nothing when it is cleared", () => {
    const from = nav({ filter: "x", expandedSections: open('files', 'checks') })
    expect(setFilter(from, "", counts()).expandedSections).toEqual(open('files', 'checks'))
  })

  test("leaves out of the reader's sections only those it opened itself, cleared or not", () => {
    const filtered = setFilter(nav({ expandedSections: open('description', 'files') }), "x", counts({ commits: 0 }))
    expect(filtered.filterOpened).toEqual(open('checks', 'conversation'))
    expect(readerSections(filtered)).toEqual(open('description', 'files'))
    expect(readerSections(setFilter(filtered, "", counts()))).toEqual(open('description', 'files'))
  })

  test("hands a section it opened to the reader once they open or fold it", () => {
    const filtered = setFilter(nav({ expandedSections: open(), activeSection: 'files' }), "x", counts())
    expect(readerSections(expandSection(filtered))).toEqual(open('files'))
    expect(readerSections(collapseSection(filtered))).toEqual(open())
    expect(collapseSection(filtered).filterOpened).toEqual(open('checks', 'conversation', 'commits'))
  })

  test("is forgotten by collapseAll and expandAll, which choose every section", () => {
    const filtered = setFilter(nav({ expandedSections: open() }), "x", counts())
    expect(collapseAll(filtered).filterOpened).toEqual(open())
    expect(readerSections(expandAll(filtered))).toEqual(new Set(ALL_SECTIONS))
  })
})

describe("withFilter", () => {
  test("changes the filter alone, and hands back the same nav for the same filter", () => {
    const from = nav({ activeSection: 'files', cursorIndex: 4, expandedSections: open() })
    expect(withFilter(from, "x")).toEqual({ ...from, filter: "x" })
    expect(withFilter(from, "")).toBe(from)
  })
})

describe("withCursor", () => {
  test("puts the cursor on the row asked for and leaves the rest", () => {
    const from = nav({ activeSection: 'checks', cursorIndex: 3, expandedCheckIds: new Set([7]) })
    expect(withCursor(from, 1)).toEqual({ ...from, cursorIndex: 1 })
  })

  test("hands back the same nav when the cursor is already there", () => {
    const from = nav({ activeSection: 'checks', cursorIndex: 1 })
    expect(withCursor(from, 1)).toBe(from)
  })
})

describe("navAt", () => {
  test("reads a position under the given filter, with sets of its own", () => {
    const position = {
      activeSection: 'files' as const,
      cursorIndex: 2,
      expandedSections: open('files'),
      expandedThreads: new Set(["t"]),
      expandedContent: new Set(["c"]),
      expandedCheckIds: new Set([3]),
      expandedPoints: new Set(['checks'] as const),
      filterOpened: open('commits'),
    }
    const restored = navAt(position, "greet")
    expect(restored).toEqual({ ...position, filter: "greet" })
    position.expandedSections.add('commits')
    expect(restored.expandedSections).toEqual(open('files'))
  })
})

describe("restoreNav", () => {
  test("clamps the cursor into a section that lost rows", () => {
    expect(restoreNav(nav({ activeSection: 'files', cursorIndex: 9 }), counts()).cursorIndex).toBe(4)
  })

  test("keeps the description's row, which layout has not counted yet", () => {
    expect(restoreNav(nav({ cursorIndex: 9 }), counts({ description: 0 })).cursorIndex).toBe(9)
  })
})

describe("flashTargets", () => {
  test("labels every header and the rows of open sections but the description", () => {
    expect(flashTargets(nav({ expandedSections: open('description', 'checks') }), counts())).toEqual([
      'checks', 'checks:0', 'checks:1', 'description', 'previews', 'conversation', 'files', 'commits',
    ])
  })
})

describe("flashJumpNav", () => {
  test("is null for an id that names no section", () => {
    expect(flashJumpNav(nav(), "nowhere:1", counts())).toBeNull()
  })

  test("clamps a row past the end and puts a header id on the header", () => {
    expect(flashJumpNav(nav(), "files:9", counts())).toMatchObject({ activeSection: 'files', cursorIndex: 4 })
    expect(flashJumpNav(nav({ cursorIndex: 2 }), "checks", counts()))
      .toMatchObject({ activeSection: 'checks', cursorIndex: -1 })
  })
})

describe("bottomTarget", () => {
  test("is the last section's header when it is folded or empty, else its last row", () => {
    expect(bottomTarget(nav({ expandedSections: open() }), counts())).toBe('commits')
    expect(bottomTarget(nav({ expandedSections: open('commits') }), counts({ commits: 0 }))).toBe('commits')
    expect(bottomTarget(nav({ expandedSections: open('commits') }), counts())).toBe('commits:1')
  })
})

describe("toggles", () => {
  test("the point toggles add and remove, and expand/collapse hand back the same nav when there is nothing to do", () => {
    const folded = nav({ expandedPoints: new Set() })
    const opened = togglePoint(folded, 'checks')
    expect(opened.expandedPoints).toEqual(new Set(['checks']))
    expect(togglePoint(opened, 'checks').expandedPoints).toEqual(new Set())
    expect(expandPoint(opened, 'checks')).toBe(opened)
    expect(collapsePoint(folded, 'checks')).toBe(folded)
    expect(expandPoint(folded, 'checks').expandedPoints).toEqual(new Set(['checks']))
    expect(collapsePoint(opened, 'checks').expandedPoints).toEqual(new Set())
  })

  test("toggleCheck adds and removes a check", () => {
    const opened = toggleCheck(nav(), 7)
    expect(opened.expandedCheckIds).toEqual(new Set([7]))
    expect(toggleCheck(opened, 7).expandedCheckIds).toEqual(new Set())
  })

  test("the content toggles add and remove, and expand/collapse hand back the same nav when there is nothing to do", () => {
    const opened = toggleContent(nav(), "c1")
    expect(opened.expandedContent).toEqual(new Set(["c1"]))
    expect(toggleContent(opened, "c1").expandedContent).toEqual(new Set())
    expect(expandContent(opened, "c1")).toBe(opened)
    expect(collapseContent(nav(), "c1")).toEqual(nav())
    expect(expandContent(nav(), "c2").expandedContent).toEqual(new Set(["c2"]))
    expect(collapseContent(opened, "c1").expandedContent).toEqual(new Set())
  })

  test("expandAll opens every section and collapseAll none", () => {
    expect(expandAll(nav()).expandedSections.size).toBe(6)
    expect(collapseAll(nav()).expandedSections.size).toBe(0)
  })
})

describe("reactionTargetOf", () => {
  const review = { id: "r1", author: "a", state: "APPROVED", body: "", threads: [] }
  const thread = { id: "t1", author: "a", body: "", path: "x.ts", line: 1, replies: [] }
  const item = (flat: unknown) => flat as FlatConversationItem

  test("the description reacts on the PR body", () => {
    expect(reactionTargetOf(undefined, 'description', 9)).toEqual({ kind: "issue", prNumber: 9 })
  })

  test("a conversation comment reacts on the issue comment", () => {
    expect(reactionTargetOf(item({ type: 'pr-comment', data: { id: 5 } }), 'conversation', 9))
      .toEqual({ kind: "issue-comment", githubId: 5 })
  })

  test("a review reacts on its summary once GitHub has given it an id", () => {
    expect(reactionTargetOf(item({ type: 'review-header', data: { ...review, databaseId: 3 } }), 'conversation', 9))
      .toEqual({ kind: "review", reviewId: 3, prNumber: 9 })
    expect(reactionTargetOf(item({ type: 'review-header', data: review }), 'conversation', 9)).toBeNull()
  })

  test("a thread reacts on its root comment once it has an id", () => {
    const parentReview = review
    expect(reactionTargetOf(item({ type: 'review-thread', data: { ...thread, githubId: 4 }, parentReview }), 'conversation', 9))
      .toEqual({ kind: "review-comment", githubId: 4 })
    expect(reactionTargetOf(item({ type: 'review-thread', data: thread, parentReview }), 'conversation', 9)).toBeNull()
  })

  test("a pending reviewer, a missing row and other sections have nothing to react to", () => {
    expect(reactionTargetOf(item({ type: 'pending-reviewer', data: ["b"] }), 'conversation', 9)).toBeNull()
    expect(reactionTargetOf(undefined, 'conversation', 9)).toBeNull()
    expect(reactionTargetOf(item({ type: 'pr-comment', data: { id: 5 } }), 'files', 9)).toBeNull()
  })
})
