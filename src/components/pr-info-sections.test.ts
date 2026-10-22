import { describe, expect, test } from "bun:test"
import type { PrInfo } from "../providers/github/types"
import { checks, commits, conversationComments, prInfo, previews, PR_NOW, reviews, reviewThreadComments } from "../testing/pr-info"
import type { DiffFile } from "../utils/diff-parser"
import { theme } from "../theme"
import { mergeStatus } from "./merge-status-model"
import { conversationItems } from "./pr-info-items"
import type { SummarySpan } from "./fit-spans"
import { sectionConfigs, type SectionConfig, type SectionConfigsInput } from "./pr-info-sections"

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

const plain = (spans: readonly SummarySpan[] | undefined) => (spans ?? []).map((span) => span.text).join("")

const header = (config: SectionConfig) =>
  config.count === null
    ? `${config.title} → ${plain(config.openSummary)}`
    : `${config.title} (${config.count}${config.countSuffix ?? ""}) ${plain(config.summary)}${config.hasItems ? "" : " [no items]"}`

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
  const configOf = (status: ReturnType<typeof mergeStatus>, info: PrInfo) =>
    sectionConfigs(input({ prInfo: info, mergeStatus: status }))[0]!

  test("carries the verdict in its line state's colour open, and no count", () => {
    const pr = prInfo("", { baseRef: "main", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", checks: [] })
    expect(configOf(mergeStatus({ prInfo: pr, comments: [], behindBy: 0 }), pr).openSummary)
      .toEqual([{ text: "✓ ready", fg: theme.green }])
    expect(configOf(mergeStatus({ prInfo: pr, comments: [], behindBy: 2 }), pr).openSummary)
      .toEqual([{ text: "⚠ mergeable with warnings", fg: theme.yellow }])
    expect(configOf(mergeStatus({ prInfo: { ...pr, isDraft: true }, comments: [], behindBy: 0 }), pr).openSummary)
      .toEqual([{ text: "✗ blocked", fg: theme.red }])
    expect(sectionConfigs(input())[0]).toMatchObject({ title: "Merge status", count: null })
  })

  test("names what blocks while folded", () => {
    const pr = prInfo("", { baseRef: "main", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", checks: [], isDraft: true })
    expect(plain(configOf(mergeStatus({ prInfo: pr, comments: [], behindBy: 0 }), pr).summary)).toBe("✗ blocked · draft")
  })
})
