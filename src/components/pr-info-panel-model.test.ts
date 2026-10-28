import { describe, expect, test } from "bun:test"
import type { PRInfoPanelSection } from "../state"
import { checks, commits, conversationComments, previews, prInfo, reviews, reviewThreadComments } from "../testing/pr-info"
import type { DiffFile } from "../utils/diff-parser"
import { mergeStatus } from "./merge-status-model"
import { conversationItems, flatCheckItems, flatConversationItems } from "./pr-info-items"
import { initialNav, type PrInfoNav } from "./pr-info-nav"
import { panelSections, type PanelInput, type PanelSection } from "./pr-info-panel-model"

const FILES: DiffFile[] = [
  { filename: "src/greet.ts", additions: 3, deletions: 1, status: "modified", content: "" },
  { filename: "src/farewell.ts", additions: 5, deletions: 0, status: "added", content: "" },
]

const ALL = new Set<PRInfoPanelSection>(["checks", "description", "previews", "conversation", "files", "commits"])

function input(over: Partial<PrInfoNav> = {}, labels: ReadonlyMap<string, string> = new Map()): PanelInput {
  const nav: PrInfoNav = { ...initialNav(), expandedSections: ALL, ...over }
  const info = prInfo("Adds the skill.", {
    reviews: reviews(),
    conversationComments: conversationComments(),
    checks: checks(),
    commits: commits(3),
  })
  const items = conversationItems(info, reviewThreadComments(), new Set())
  const status = mergeStatus({ prInfo: info, comments: reviewThreadComments(), behindBy: null })
  return {
    prInfo: info,
    files: FILES,
    previews: previews(),
    conversationItems: items,
    hiddenConversationIds: new Set(),
    flatConversationItems: flatConversationItems(items, nav.filter, nav.expandedContent),
    flatCheckItems: flatCheckItems(status.points, { checks: info.checks, threads: status.threads }, nav),
    mergeStatus: status,
    nav,
    flashLabels: labels,
    panelWidth: 120,
    listWidth: 93,
  }
}

const byKey = (sections: PanelSection[], key: PRInfoPanelSection) => sections.find((section) => section.key === key)!

function listOf(section: PanelSection) {
  if (section.body?.kind !== "list") throw new Error(`${section.key} has no list body`)
  return section.body.rows
}

describe("panelSections", () => {
  test("lists every section in the panel's order", () => {
    expect(panelSections(input()).map((section) => section.key)).toEqual([...ALL])
  })

  test("highlights the header only of the active section, and only with the cursor on it", () => {
    const onHeader = panelSections(input({ activeSection: "files", cursorIndex: -1 }))
    expect(onHeader.filter((section) => section.header.highlighted).map((section) => section.key)).toEqual(["files"])

    const onRow = panelSections(input({ activeSection: "files", cursorIndex: 0 }))
    expect(onRow.some((section) => section.header.highlighted)).toBe(false)
  })

  test("gives a collapsed section no body, and an open one the body of its kind", () => {
    const sections = panelSections(input({ expandedSections: new Set(["description", "conversation", "files"]) }))
    expect(byKey(sections, "checks")).toMatchObject({ expanded: false, body: null })
    expect(byKey(sections, "commits").body).toBeNull()
    expect(byKey(sections, "description").body?.kind).toBe("description")
    expect(byKey(sections, "conversation").body?.kind).toBe("conversation")
    expect(byKey(sections, "files").body?.kind).toBe("list")
  })

  test("draws only the rows a filter leaves, and counts them in the header", () => {
    const sections = panelSections(input({ filter: "farewell" }))
    const files = byKey(sections, "files")
    expect(listOf(files).rows.map((row) => row.key)).toEqual(["src/farewell.ts"])
    expect(files.header.text).toBe("▼  Files (1)")
  })

  test("selects no row in the sections the cursor is not in", () => {
    const sections = panelSections(input({ activeSection: "files", cursorIndex: 1 }))
    expect(listOf(byKey(sections, "files")).rows.map((row) => row.selected)).toEqual([false, true])
    for (const key of ["previews", "checks", "commits"] as const) {
      expect(listOf(byKey(sections, key)).rows.some((row) => row.selected)).toBe(false)
    }
    const conversation = byKey(sections, "conversation").body
    if (conversation?.kind !== "conversation") throw new Error("no conversation body")
    expect(conversation.rows.rows.some((row) => row.selected)).toBe(false)
    const description = byKey(sections, "description").body
    expect(description?.kind === "description" && description.model.cursorLine).toBeNull()
  })

  test("hands the flash labels to the headers and to the rows", () => {
    const labels = new Map([["checks", "a"], ["files:1", "sd"], ["conversation:0", "f"]])
    const sections = panelSections(input({}, labels))
    expect(byKey(sections, "checks").header.label).toBe("a")
    expect(byKey(sections, "files").header.label).toBeNull()
    expect(listOf(byKey(sections, "files")).rows.map((row) => row.label ?? null)).toEqual([null, "sd"])
    const conversation = byKey(sections, "conversation").body
    if (conversation?.kind !== "conversation") throw new Error("no conversation body")
    expect(conversation.rows.rows[0]?.label).toBe("f")
  })
})
