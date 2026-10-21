import { colors, theme } from "../theme"
import type { BranchPr } from "../providers/current-pr"
import type { DiffFile } from "../utils/diff-parser"
import type { PrInfo, PrCommit, PrCheck } from "../providers/github/types"
import type { MergeReading, MergeVerdict } from "../utils/merge-verdict"

export interface HeaderPart {
  content: string
  fg: string
}

/**
 * What the one-row header shows. Each inner array is one run of texts drawn
 * with no gap between them, as the `+a -d` counts are; `left` shrinks and
 * clips, `right` keeps its width.
 */
export interface HeaderModel {
  left: HeaderPart[][]
  leftGap: number
  right: HeaderPart[][]
}

export interface HeaderProps {
  title?: string
  selectedFile?: DiffFile | null  // null = all files
  totalFiles?: number
  prInfo?: PrInfo | null
  reviewProgress?: { reviewed: number; total: number; outdated?: number }
  branchInfo?: string | null
  /** Currently viewing a specific commit (null = all commits) */
  viewingCommit?: string | null
  /** Every commit in scope, when more than one is (spec 078). */
  viewingCommitScope?: string[] | null
  /** The pull request this branch already has, in local mode (spec 079). */
  branchPr?: BranchPr | null
  /** All available commits (for showing count) */
  commits?: PrCommit[]
  /** ISO time the diff/comments were last pulled from the source. */
  lastRefreshedAt?: string | null
  /** Whose move it is — can this land, and if not, who is holding it. */
  merge?: MergeReading | null
}

/**
 * The verdict's one glyph: whose move it is. A tick for nobody's, a bang
 * for the author's, a question mark for someone else's, a dot for a
 * machine's — the same four presto uses, so a reader of both sees one thing.
 */
function mergeGlyph(verdict: MergeVerdict): string {
  switch (verdict) {
    case "ready":
      return "✓"
    case "author":
      return "!"
    case "others":
      return "?"
    case "auto-merge":
      return "⇢"
    case "draft":
      return "◌"
    default:
      return "·"
  }
}

function mergeColor(verdict: MergeVerdict): string {
  switch (verdict) {
    case "ready":
      return theme.green
    case "author":
      return theme.yellow
    case "others":
      return theme.blue
    case "auto-merge":
      return theme.mauve
    default:
      return theme.overlay0
  }
}

/**
 * Compact summary of CI check status shown in the PR-mode header
 * (spec 041). Returns null when there are no checks so the indicator is
 * omitted entirely.
 */
export function summarizeChecks(checks?: PrCheck[]): { text: string; color: string } | null {
  if (!checks?.length) return null
  let pass = 0
  let fail = 0
  let pending = 0
  for (const c of checks) {
    if (c.status !== "completed") {
      pending++
      continue
    }
    switch (c.conclusion) {
      case "success":
      case "skipped":
      case "neutral":
        pass++
        break
      case "failure":
      case "timed_out":
      case "cancelled":
      case "action_required":
        fail++
        break
      default:
        pending++
    }
  }
  if (fail > 0) return { text: `✗ ${fail}`, color: theme.red }
  if (pending > 0) return { text: `○ ${pending}`, color: theme.yellow }
  if (pass > 0) return { text: "✓", color: theme.green }
  return null
}

/** Compact "last refreshed" indicator, e.g. "↻ 14:23". Null when unknown. */
function formatRefreshed(iso?: string | null): string | null {
  if (!iso) return null
  const t = new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  return `↻ ${t}`
}

function commitFilterText(
  commits: PrCommit[] | undefined,
  viewingCommit: string | null | undefined,
  viewingCommitScope: string[] | null | undefined
): string | null {
  if (!commits || commits.length === 0) return null
  if (viewingCommit === null || viewingCommit === undefined) return null
  // Named as a mode, not just as a commit: the reader has to know they
  // are looking at one commit's slice of the diff, and how to leave it.
  const index = commits.findIndex(c => c.sha === viewingCommit)
  const commit = commits[index]
  const position = index === -1 ? "" : ` ${index + 1}/${commits.length}`

  // Several commits say how many, or how far they reach when they are a
  // run, rather than naming one of the subjects they cover (spec 078).
  if (viewingCommitScope && viewingCommitScope.length > 1) {
    const positions = viewingCommitScope
      .map((sha) => commits.findIndex((commit) => commit.sha === sha))
      .filter((at) => at !== -1)
      .sort((a, b) => a - b)
    const run =
      positions.length > 1 &&
      positions[positions.length - 1]! - positions[0]! === positions.length - 1
    return run
      ? `commits ${positions[0]! + 1}–${positions[positions.length - 1]! + 1}/${commits.length} · esc: all commits`
      : `${viewingCommitScope.length} commits of ${commits.length} · esc: all commits`
  }

  if (!commit) return `commit${position} · ${viewingCommit.slice(0, 7)} · esc: all commits`
  return `commit${position} · ${commit.sha} ${commit.message} · esc: all commits`
}

function progressPart(reviewProgress: HeaderProps["reviewProgress"]): HeaderPart | null {
  if (!reviewProgress || reviewProgress.total <= 0) return null
  const outdated = reviewProgress.outdated ?? 0
  if (outdated > 0) {
    return {
      content: `${reviewProgress.reviewed}/${reviewProgress.total} reviewed (${outdated} outdated)`,
      fg: theme.peach,
    }
  }
  return {
    content: `${reviewProgress.reviewed}/${reviewProgress.total} reviewed`,
    fg: reviewProgress.reviewed === reviewProgress.total ? theme.green : theme.subtext0,
  }
}

function prStatus(prInfo: PrInfo): HeaderPart {
  if (prInfo.isDraft) return { content: "Draft", fg: theme.overlay1 }
  if (prInfo.state === "merged") return { content: "Merged", fg: theme.mauve }
  if (prInfo.state === "closed") return { content: "Closed", fg: theme.red }
  return { content: "Open", fg: theme.green }
}

function branchRuns(branchInfo: string | null | undefined, branchPr: BranchPr | null | undefined): HeaderPart[][] {
  const runs: HeaderPart[][] = []
  if (branchInfo) {
    const parts = branchInfo.split(" → ")
    if (parts.length === 2) {
      runs.push(
        [{ content: parts[0]!, fg: theme.sapphire }],
        [{ content: " → ", fg: theme.subtext0 }],
        [{ content: parts[1]!, fg: theme.sapphire }],
      )
    } else {
      runs.push([{ content: branchInfo, fg: theme.sapphire }])
    }
  }

  // The branch already has a pull request: say which, and how far along it
  // is, because a local review of a branch under review is a different job
  // (spec 079).
  if (branchPr) {
    runs.push([
      {
        content: `  #${branchPr.number}${branchPr.isDraft ? " draft" : ""}`,
        fg: branchPr.state === "OPEN" ? theme.green : theme.overlay0,
      },
    ])
  }
  return runs
}

export function headerModel({
  title = "riff",
  merge,
  selectedFile,
  totalFiles,
  prInfo,
  reviewProgress,
  branchInfo,
  viewingCommit,
  viewingCommitScope,
  commits,
  branchPr,
  lastRefreshedAt,
}: HeaderProps = {}): HeaderModel {
  const refreshedText = formatRefreshed(lastRefreshedAt)
  const filterText = commitFilterText(commits, viewingCommit, viewingCommitScope)
  const progress = progressPart(reviewProgress)

  const rightTail: HeaderPart[][] = [
    ...(refreshedText ? [[{ content: refreshedText, fg: theme.overlay0 }]] : []),
    ...(progress ? [[progress]] : []),
    ...(selectedFile
      ? [[
          { content: `+${selectedFile.additions}`, fg: theme.green },
          { content: " ", fg: colors.text },
          { content: `-${selectedFile.deletions}`, fg: theme.red },
        ]]
      : []),
  ]

  if (prInfo) {
    const checks = summarizeChecks(prInfo.checks)
    return {
      left: [
        [prStatus(prInfo)],
        [{ content: `#${prInfo.number}`, fg: theme.sapphire }],
        [{ content: `@${prInfo.author}`, fg: theme.subtext0 }],
        filterText
          ? [{ content: filterText, fg: theme.peach }]
          : [{ content: prInfo.title, fg: colors.text }],
      ],
      leftGap: 1,
      right: [
        ...(merge ? [[{ content: `${mergeGlyph(merge.verdict)} ${merge.text}`, fg: mergeColor(merge.verdict) }]] : []),
        ...(checks ? [[{ content: checks.text, fg: checks.color }]] : []),
        ...rightTail,
      ],
    }
  }

  const scopeText = selectedFile
    ? selectedFile.filename
    : totalFiles
      ? `All files (${totalFiles})`
      : "All files"

  return {
    left: [
      [{ content: title, fg: colors.headerFg }],
      ...branchRuns(branchInfo, branchPr),
      ...(filterText ? [[{ content: filterText, fg: theme.peach }]] : []),
      [{ content: scopeText, fg: colors.text }],
    ],
    leftGap: 2,
    right: rightTail,
  }
}
