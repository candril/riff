import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"
import type { BranchPr } from "../providers/current-pr"
import type { DiffFile } from "../utils/diff-parser"
import type { PrInfo, PrCommit, PrCheck } from "../providers/github"
import type { MergeReading, MergeVerdict } from "../utils/merge-verdict"
import { cellsOf } from "../diff-rows/cells"
import { RIGHT_GAP, naturalCells, versionFits } from "./header-fit"

interface Part {
  content: string
  fg: string
}

/** A Text, or a run of Texts with no gap between them. */
type Child = Part[]

const VERSION_ID = "header-version"

function drawChild(child: Child) {
  return child.length === 1
    ? Text(child[0]!)
    : Box({ flexDirection: "row" }, ...child.map((part) => Text(part)))
}

const contentsOf = (children: Child[]) => children.map((child) => child.map((part) => part.content))

/**
 * The one-row header: `left` shrinks and clips, `right` keeps its width,
 * and the version, when given, is shown at the far right only while the
 * rest fits whole beside it. The row decides when it is first laid out
 * and again on every change of width, because nothing re-renders the
 * header on a resize.
 */
function headerRow(left: Child[], leftGap: number, right: Child[], version: string | undefined) {
  const natural = { left: naturalCells(contentsOf(left), leftGap), right: naturalCells(contentsOf(right), RIGHT_GAP) }
  const fits = (cells: number) => version !== undefined && versionFits(cells, natural, cellsOf(version))
  return Box(
    {
      height: 1,
      width: "100%",
      backgroundColor: colors.headerBg,
      paddingLeft: 1,
      paddingRight: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      onSizeChange() {
        const versionText = this.findDescendantById(VERSION_ID)
        if (versionText) versionText.visible = fits(this.width)
      },
    },
    Box({ flexDirection: "row", gap: leftGap, flexShrink: 1, overflow: "hidden" }, ...left.map(drawChild)),
    Box(
      { flexDirection: "row", gap: RIGHT_GAP, flexShrink: 0 },
      ...right.map(drawChild),
      version !== undefined
        ? Text({ id: VERSION_ID, content: version, fg: theme.overlay0, visible: false })
        : null
    )
  )
}

/**
 * Compact summary of CI check status shown in the PR-mode header
 * (spec 041). Returns null when there are no checks so the indicator is
 * omitted entirely.
 */
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

function summarizeChecks(checks?: PrCheck[]): { text: string; color: string } | null {
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
  /** The build, as `riff --version` names it; omitted, nothing is drawn. */
  version?: string
}

/** Compact "last refreshed" indicator, e.g. "↻ 14:23". Null when unknown. */
function formatRefreshed(iso?: string | null): string | null {
  if (!iso) return null
  const t = new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  return `↻ ${t}`
}

export function Header({
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
  version,
}: HeaderProps = {}) {
  const refreshedText = formatRefreshed(lastRefreshedAt)
  // Scope text
  const scopeText = selectedFile 
    ? selectedFile.filename 
    : totalFiles 
      ? `All files (${totalFiles})`
      : "All files"

  // Commit filter text
  const commitFilterText = (() => {
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
        ? `commits ${positions[0]! + 1}\u2013${positions[positions.length - 1]! + 1}/${commits.length} · esc: all commits`
        : `${viewingCommitScope.length} commits of ${commits.length} · esc: all commits`
    }

    if (!commit) return `commit${position} · ${viewingCommit.slice(0, 7)} · esc: all commits`
    return `commit${position} · ${commit.sha} ${commit.message} · esc: all commits`
  })()

  // Review progress text (e.g., "3/5 reviewed" or "3/5 reviewed (1 outdated)")
  const hasOutdated = reviewProgress && (reviewProgress.outdated ?? 0) > 0
  const progressText = reviewProgress && reviewProgress.total > 0
    ? hasOutdated
      ? `${reviewProgress.reviewed}/${reviewProgress.total} reviewed (${reviewProgress.outdated} outdated)`
      : `${reviewProgress.reviewed}/${reviewProgress.total} reviewed`
    : null
  const progressColor = hasOutdated
    ? theme.peach  // Has outdated files
    : reviewProgress && reviewProgress.reviewed === reviewProgress.total
      ? theme.green  // All done!
      : theme.subtext0

  const rightTail: Child[] = [
    ...(refreshedText ? [[{ content: refreshedText, fg: theme.overlay0 }]] : []),
    ...(progressText ? [[{ content: progressText, fg: progressColor }]] : []),
    ...(selectedFile
      ? [[
          { content: `+${selectedFile.additions}`, fg: theme.green },
          { content: " ", fg: colors.text },
          { content: `-${selectedFile.deletions}`, fg: theme.red },
        ]]
      : []),
  ]

  // PR mode header
  if (prInfo) {
    // PR status badge
    const statusText = prInfo.isDraft 
      ? "Draft" 
      : prInfo.state === "merged" 
        ? "Merged" 
        : prInfo.state === "closed" 
          ? "Closed" 
          : "Open"
    const statusColor = prInfo.isDraft
      ? theme.overlay1      // Gray for draft
      : prInfo.state === "merged"
        ? theme.mauve       // Purple for merged
        : prInfo.state === "closed"
          ? theme.red       // Red for closed
          : theme.green     // Green for open

    const checks = summarizeChecks(prInfo.checks)
    const left: Child[] = [
      [{ content: statusText, fg: statusColor }],
      [{ content: `#${prInfo.number}`, fg: theme.sapphire }],
      [{ content: `@${prInfo.author}`, fg: theme.subtext0 }],
      commitFilterText
        ? [{ content: commitFilterText, fg: theme.peach }]
        : [{ content: prInfo.title, fg: colors.text }],
    ]
    const right: Child[] = [
      ...(merge ? [[{ content: `${mergeGlyph(merge.verdict)} ${merge.text}`, fg: mergeColor(merge.verdict) }]] : []),
      ...(checks ? [[{ content: checks.text, fg: checks.color }]] : []),
      ...rightTail,
    ]
    return headerRow(left, 1, right, version)
  }

  // Local mode header
  const branchElements: Child[] = []
  if (branchInfo) {
    const parts = branchInfo.split(" → ")
    if (parts.length === 2) {
      branchElements.push(
        [{ content: parts[0]!, fg: theme.sapphire }],
        [{ content: " → ", fg: theme.subtext0 }],
        [{ content: parts[1]!, fg: theme.sapphire }],
      )
    } else {
      branchElements.push([{ content: branchInfo, fg: theme.sapphire }])
    }
  }

  // The branch already has a pull request: say which, and how far along it
  // is, because a local review of a branch under review is a different job
  // (spec 079).
  if (branchPr) {
    branchElements.push([
      {
        content: `  #${branchPr.number}${branchPr.isDraft ? " draft" : ""}`,
        fg: branchPr.state === "OPEN" ? theme.green : theme.overlay0,
      },
    ])
  }

  const left: Child[] = [
    [{ content: title, fg: colors.headerFg }],
    ...branchElements,
    ...(commitFilterText ? [[{ content: commitFilterText, fg: theme.peach }]] : []),
    [{ content: scopeText, fg: colors.text }],
  ]
  return headerRow(left, 2, rightTail, version)
}
