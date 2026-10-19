import { describe, expect, test } from "bun:test"
import type { PrCheck, PrInfo } from "../providers/github"
import { checks, commits, conversationComments, prInfo, previews, PR_NOW, reviews, reviewThreadComments } from "../testing/pr-info"
import type { DiffFile } from "../utils/diff-parser"
import { conversationItems } from "./pr-info-items"
import {
  checksAggregateStatus,
  lastCommitSummary,
  previewsSummary,
  sectionConfigs,
  unresolvedSummary,
  type SectionConfigsInput,
} from "./pr-info-sections"

const NOW = PR_NOW.getTime()

const FILES: DiffFile[] = [
  { filename: "src/greet.ts", additions: 3, deletions: 1, status: "modified", content: "" },
  { filename: "src/farewell.ts", additions: 5, deletions: 0, status: "added", content: "" },
]

const fullPr = (extra: Partial<PrInfo> = {}): PrInfo =>
  prInfo("Adds the **skill**.\n\nSecond line with `code`.", {
    reviews: reviews(),
    conversationComments: conversationComments(),
    checks: checks(),
    commits: commits(23),
    ...extra,
  })

function input(over: Partial<SectionConfigsInput> = {}): SectionConfigsInput {
  const info = over.prInfo ?? fullPr()
  const hidden = over.hiddenConversationIds ?? new Set<string>()
  return {
    prInfo: info,
    files: FILES,
    previews: previews(),
    conversationItems: conversationItems(info, reviewThreadComments(), hidden),
    hiddenConversationIds: hidden,
    filter: "",
    now: NOW,
    ...over,
  }
}

const header = (config: { title: string; count: number; countSuffix?: string; preview: string; hasItems: boolean }) =>
  `${config.title} (${config.count}${config.countSuffix ?? ""}) ${config.preview}${config.hasItems ? "" : " [no items]"}`

describe("sectionConfigs", () => {
  test("names, counts and sums up all six sections of the full PR", () => {
    expect(sectionConfigs(input()).map(header)).toEqual([
      "Description (2) 2 lines [no items]",
      "Previews (2) 1 live · 1 on demand  ·  from deploy-bot[bot]",
      "Checks (6) ✗ 4 failed",
      "Conversation (7) 2 unresolved",
      "Files (2) +98 -0",
      "Commits (23) last 1h",
    ])
    expect(sectionConfigs(input()).map((config) => config.id)).toEqual([
      "description",
      "previews",
      "checks",
      "conversation",
      "files",
      "commits",
    ])
  })

  test("says how many conversation comments are hidden", () => {
    const configs = sectionConfigs(input({ hiddenConversationIds: new Set(["502"]) }))
    expect(header(configs[3]!)).toBe("Conversation (6 · 1 hidden) 2 unresolved")
    expect(sectionConfigs(input())[3]!.countSuffix).toBeUndefined()
  })

  test("calls a description without text empty", () => {
    const configs = sectionConfigs(input({ prInfo: fullPr({ body: "  \n\n" }) }))
    expect(header(configs[0]!)).toBe("Description (0) empty [no items]")
  })

  test("leaves the previews summary empty without previews", () => {
    expect(header(sectionConfigs(input({ previews: null }))[1]!)).toBe("Previews (0)  [no items]")
  })

  test("counts what the filter leaves", () => {
    const configs = sectionConfigs(input({ filter: "farewell" }))
    expect(configs.map(header)).toEqual([
      "Description (2) 2 lines [no items]",
      "Previews (0) from deploy-bot[bot] [no items]",
      "Checks (6) ✗ 4 failed",
      "Conversation (7) 2 unresolved",
      "Files (1) +98 -0",
      "Commits (0)  [no items]",
    ])
    expect(header(sectionConfigs(input({ filter: "step 1" }))[5]!)).toBe("Commits (11) last 4h")
  })
})

describe("checksAggregateStatus", () => {
  const check = (over: Partial<PrCheck>): PrCheck => ({
    id: 1,
    name: "build",
    status: "completed",
    conclusion: "success",
    detailsUrl: null,
    startedAt: null,
    completedAt: null,
    ...over,
  })

  test("says no checks without any", () => {
    expect(checksAggregateStatus([]).text).toBe("no checks")
  })

  test("counts failures before anything pending", () => {
    expect(checksAggregateStatus(checks())).toMatchObject({ icon: "✗", text: "4 failed" })
  })

  test("counts what is pending when nothing failed", () => {
    expect(
      checksAggregateStatus([check({}), check({ status: "queued", conclusion: null }), check({ status: "in_progress", conclusion: null })])
    ).toMatchObject({ icon: "○", text: "2 pending" })
  })

  test("calls success, neutral and skipped all passed", () => {
    expect(
      checksAggregateStatus([check({}), check({ conclusion: "neutral" }), check({ conclusion: "skipped" })])
    ).toMatchObject({ icon: "✓", text: "all passed" })
  })
})

describe("previewsSummary", () => {
  test("counts live and on-demand rows and names who posted them", () => {
    const set = previews()
    expect(previewsSummary(set, set.rows)).toBe("1 live · 1 on demand  ·  from deploy-bot[bot]")
  })

  test("leaves out a count that is zero", () => {
    const set = previews()
    expect(previewsSummary(set, set.rows.slice(0, 1))).toBe("1 live  ·  from deploy-bot[bot]")
    expect(previewsSummary(set, set.rows.slice(1))).toBe("1 on demand  ·  from deploy-bot[bot]")
  })
})

describe("unresolvedSummary", () => {
  test("counts unresolved threads across reviews", () => {
    expect(unresolvedSummary(conversationItems(fullPr(), reviewThreadComments(), new Set()))).toBe("2 unresolved")
  })

  test("is empty when every thread is resolved", () => {
    const resolved = reviewThreadComments().map((comment) => ({ ...comment, isThreadResolved: true }))
    expect(unresolvedSummary(conversationItems(fullPr(), resolved, new Set()))).toBe("")
  })
})

describe("lastCommitSummary", () => {
  test("says when the last commit landed", () => {
    expect(lastCommitSummary(commits(3), NOW)).toBe("last 1h")
    expect(lastCommitSummary(commits(3), NOW + 2 * 24 * 3_600_000)).toBe("last 2d")
  })

  test("is empty without commits", () => {
    expect(lastCommitSummary([], NOW)).toBe("")
  })
})
