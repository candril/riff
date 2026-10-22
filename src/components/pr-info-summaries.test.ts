import { describe, expect, test } from "bun:test"
import { checks, commits, conversationComments, previews, prInfo, PR_NOW, reviews, reviewThreadComments } from "../testing/pr-info"
import { theme } from "../theme"
import { conversationItems } from "./pr-info-items"
import {
  descriptionSummary,
  filesSummary,
  lastCommitSummary,
  previewsSummary,
  unresolvedSummary,
} from "./pr-info-summaries"

const NOW = PR_NOW.getTime()

const fullPr = () =>
  prInfo("Adds the skill.", {
    reviews: reviews(),
    conversationComments: conversationComments(),
    checks: checks(),
    commits: commits(23),
  })

describe("filesSummary", () => {
  test("adds in green and deletes in red", () => {
    expect(filesSummary(98, 3)).toEqual([
      { text: "+98", fg: theme.green },
      { text: " ", fg: theme.subtext0 },
      { text: "-3", fg: theme.red },
    ])
  })
})

describe("previewsSummary", () => {
  test("counts live rows in green and on-demand rows quietly, and names who posted them", () => {
    const set = previews()
    expect(previewsSummary(set, set.rows)).toEqual([
      { text: "1 live", fg: theme.green },
      { text: " · ", fg: theme.subtext0 },
      { text: "1 on demand", fg: theme.subtext0 },
      { text: "  ·  ", fg: theme.subtext0 },
      { text: "from ", fg: theme.subtext0 },
      { text: "deploy-bot[bot]", fg: theme.overlay1 },
    ])
  })

  test("leaves out a count that is zero", () => {
    const set = previews()
    const plain = (rows: typeof set.rows) => previewsSummary(set, rows).map((span) => span.text).join("")
    expect(plain(set.rows.slice(0, 1))).toBe("1 live  ·  from deploy-bot[bot]")
    expect(plain(set.rows.slice(1))).toBe("1 on demand  ·  from deploy-bot[bot]")
    expect(plain([])).toBe("from deploy-bot[bot]")
  })

  test("is empty without previews", () => {
    expect(previewsSummary(null, [])).toEqual([])
  })
})

describe("unresolvedSummary", () => {
  test("counts unresolved threads across reviews, in yellow", () => {
    expect(unresolvedSummary(conversationItems(fullPr(), reviewThreadComments(), new Set()))).toEqual([
      { text: "2 unresolved", fg: theme.yellow },
    ])
  })

  test("is empty when every thread is resolved", () => {
    const resolved = reviewThreadComments().map((comment) => ({ ...comment, isThreadResolved: true }))
    expect(unresolvedSummary(conversationItems(fullPr(), resolved, new Set()))).toEqual([])
  })
})

describe("lastCommitSummary", () => {
  test("says quietly when the last commit landed", () => {
    expect(lastCommitSummary(commits(3), NOW)).toEqual([{ text: "last 1h", fg: theme.subtext0 }])
    expect(lastCommitSummary(commits(3), NOW + 2 * 24 * 3_600_000)[0]!.text).toBe("last 2d")
  })

  test("is empty without commits", () => {
    expect(lastCommitSummary([], NOW)).toEqual([])
  })
})

describe("descriptionSummary", () => {
  test("counts the lines, or calls the description empty", () => {
    expect(descriptionSummary(2)).toEqual([{ text: "2 lines", fg: theme.subtext0 }])
    expect(descriptionSummary(0)).toEqual([{ text: "empty", fg: theme.subtext0 }])
  })
})
