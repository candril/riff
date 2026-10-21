import { describe, expect, test } from "bun:test"
import { ago, prInfo, reviews } from "../testing/pr-info"
import { theme } from "../theme"
import { panelMeta, sectionHeaderRow, stackLine } from "./pr-info-header"
import type { SectionConfig } from "./pr-info-sections"

const checks: SectionConfig = { id: "checks", title: "Checks", count: 6, preview: "✗ 4 failed", hasItems: true }
const plain = { active: false, expanded: false, highlighted: false, label: null }

describe("sectionHeaderRow", () => {
  test("points right while collapsed and down while expanded", () => {
    expect(sectionHeaderRow(checks, plain).text).toBe("▶  Checks (6)")
    expect(sectionHeaderRow(checks, { ...plain, expanded: true }).text).toBe("▼  Checks (6)")
  })

  test("shows the preview only while collapsed", () => {
    expect(sectionHeaderRow(checks, plain).preview).toBe("✗ 4 failed")
    expect(sectionHeaderRow(checks, { ...plain, expanded: true }).preview).toBeNull()
    expect(sectionHeaderRow({ ...checks, preview: "" }, plain).preview).toBeNull()
  })

  test("puts the count suffix inside the brackets", () => {
    const conversation: SectionConfig = {
      id: "conversation",
      title: "Conversation",
      count: 6,
      countSuffix: " · 1 hidden",
      preview: "",
      hasItems: true,
    }
    expect(sectionHeaderRow(conversation, plain).text).toBe("▶  Conversation (6 · 1 hidden)")
  })

  test("is blue when active, overlay0 otherwise, and carries its label and highlight", () => {
    expect(sectionHeaderRow(checks, plain)).toEqual({
      key: "checks",
      label: null,
      text: "▶  Checks (6)",
      fg: theme.overlay0,
      preview: "✗ 4 failed",
      highlighted: false,
    })
    const row = sectionHeaderRow(checks, { active: true, expanded: false, highlighted: true, label: "a" })
    expect(row.fg).toBe(theme.blue)
    expect(row.label).toBe("a")
    expect(row.highlighted).toBe(true)
  })
})

describe("panelMeta", () => {
  test("names the author and the branches", () => {
    expect(panelMeta(prInfo(""))).toEqual({ author: "someone", branches: "a-branch → master", approvers: [] })
  })

  test("keeps whoever still approves, in the order their reviews landed", () => {
    expect(panelMeta(prInfo("", { reviews: reviews() })).approvers).toEqual(["alice", "erin"])
  })

  test("drops an approval superseded by changes requested, whatever order the reviews come in", () => {
    const info = prInfo("", {
      reviews: [
        { id: "2", author: "bob", state: "CHANGES_REQUESTED", submittedAt: ago(10) },
        { id: "1", author: "bob", state: "APPROVED", submittedAt: ago(20) },
      ],
    })
    expect(panelMeta(info).approvers).toEqual([])
  })

  test("keeps an approval that only a comment or a pending review followed", () => {
    const info = prInfo("", {
      reviews: [
        { id: "1", author: "bob", state: "APPROVED", submittedAt: ago(30) },
        { id: "2", author: "bob", state: "COMMENTED", submittedAt: ago(20) },
        { id: "3", author: "bob", state: "PENDING", submittedAt: ago(10) },
      ],
    })
    expect(panelMeta(info).approvers).toEqual(["bob"])
  })
})

describe("stackLine", () => {
  const basePr = { number: 1200, title: "Base work" }

  test("holds an empty row until the stack is known, and drops it once it is known to be none", () => {
    expect(stackLine(undefined)).toEqual({ text: "", fg: theme.subtext0, visible: true })
    expect(stackLine(null)).toEqual({ text: "", fg: theme.subtext0, visible: false })
  })

  test("is yellow once the base has been rewritten, subtext0 otherwise", () => {
    expect(stackLine({ basePr, status: "rewritten", behindBy: 2 })).toEqual({
      text: "stacked on #1200 Base work · base rewritten since you branched — rebase",
      fg: theme.yellow,
      visible: true,
    })
    expect(stackLine({ basePr, status: "moved", behindBy: 1 })).toEqual({
      text: "stacked on #1200 Base work · base moved on by 1 commit",
      fg: theme.subtext0,
      visible: true,
    })
  })
})
