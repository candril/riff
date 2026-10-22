import { describe, expect, test } from "bun:test"
import type { PrInfo } from "../providers/github/types"
import { checks, commits, conversationComments, prInfo, previews, PR_NOW, reviews, reviewThreadComments } from "../testing/pr-info"
import type { DiffFile } from "../utils/diff-parser"
import { theme } from "../theme"
import { mergeStatus } from "./merge-status-model"
import { conversationItems } from "./pr-info-items"
import {
  lastCommitSummary,
  previewsSummary,
  sectionConfigs,
  unresolvedSummary,
  type SectionConfig,
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
    mergeStatus: mergeStatus({ prInfo: info, comments: reviewThreadComments(), behindBy: null }),
    filter: "",
    now: NOW,
    ...over,
  }
}

const header = (config: SectionConfig) =>
  config.count === null
    ? `${config.title} → ${config.trailing?.text}`
    : `${config.title} (${config.count}${config.countSuffix ?? ""}) ${config.preview}${config.hasItems ? "" : " [no items]"}`

describe("sectionConfigs", () => {
  test("names, counts and sums up all six sections of the full PR", () => {
    expect(sectionConfigs(input()).map(header)).toEqual([
      "Merge status → ✗ blocked",
      "Description (2) 2 lines [no items]",
      "Previews (2) 1 live · 1 on demand  ·  from deploy-bot[bot]",
      "Conversation (7) 2 unresolved",
      "Files (2) +98 -0",
      "Commits (23) last 1h",
    ])
    expect(sectionConfigs(input()).map((config) => config.id)).toEqual([
      "checks",
      "description",
      "previews",
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
    expect(header(configs[1]!)).toBe("Description (0) empty [no items]")
  })

  test("leaves the previews summary empty without previews", () => {
    expect(header(sectionConfigs(input({ previews: null }))[2]!)).toBe("Previews (0)  [no items]")
  })

  test("counts what the filter leaves", () => {
    const configs = sectionConfigs(input({ filter: "farewell" }))
    expect(configs.map(header)).toEqual([
      "Merge status → ✗ blocked",
      "Description (2) 2 lines [no items]",
      "Previews (0) from deploy-bot[bot] [no items]",
      "Conversation (7) 2 unresolved",
      "Files (1) +98 -0",
      "Commits (0)  [no items]",
    ])
    expect(header(sectionConfigs(input({ filter: "step 1" }))[5]!)).toBe("Commits (11) last 4h")
  })
})

describe("the merge status header", () => {
  const verdictOf = (status: ReturnType<typeof mergeStatus>) => sectionConfigs(input({ mergeStatus: status }))[0]!.trailing

  test("carries the verdict in its line state's colour, and no count or preview", () => {
    const pr = prInfo("", { baseRef: "main", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", checks: [] })
    expect(verdictOf(mergeStatus({ prInfo: pr, comments: [], behindBy: 0 }))).toEqual({ text: "✓ ready", fg: theme.green })
    expect(verdictOf(mergeStatus({ prInfo: pr, comments: [], behindBy: 2 })))
      .toEqual({ text: "⚠ mergeable with warnings", fg: theme.yellow })
    expect(verdictOf(mergeStatus({ prInfo: { ...pr, isDraft: true }, comments: [], behindBy: 0 })))
      .toEqual({ text: "✗ blocked", fg: theme.red })
    expect(sectionConfigs(input())[0]).toMatchObject({ title: "Merge status", count: null, preview: "" })
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
