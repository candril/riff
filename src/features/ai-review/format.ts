/**
 * Build the markdown context file that gets handed to Claude Code.
 *
 * Two entry points:
 * - buildFileContextMd: current file (or visual-line selection inside it)
 * - buildPrContextMd: the whole review, minus ignored/generated files
 */

import type { DiffFile } from "../../utils/diff-parser"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { PrInfo } from "../../providers/github"

export interface FileContextInput {
  file: DiffFile
  /** Visual-line selection range [startVisual, endVisual], inclusive. Null if no selection. */
  selection: { start: number; end: number } | null
  /** Line mapping, used only when `selection` is non-null. */
  lineMapping: DiffLineMapping | null
  mode: "local" | "pr"
  prInfo: PrInfo | null
  /** Target revision for local mode (e.g. `@-`, `main`). Undefined means working copy vs HEAD. */
  localTarget: string | undefined
}

export interface PrContextInput {
  files: DiffFile[]
  ignoredFiles: Set<string>
  mode: "local" | "pr"
  prInfo: PrInfo | null
  localTarget: string | undefined
}

export interface PrContextResult {
  markdown: string
  includedCount: number
  skippedCount: number
  bytes: number
}

export interface FolderContextInput {
  /** Directory path that the user highlighted in the file tree. */
  dirPath: string
  /** Files under `dirPath`, already filtered against `ignoredFiles` by the caller. */
  files: DiffFile[]
  mode: "local" | "pr"
  prInfo: PrInfo | null
  localTarget: string | undefined
}

export interface FolderContextResult {
  markdown: string
  includedCount: number
  bytes: number
}

export interface MultiContextInput {
  /** Files the user picked via V-mode multi-select in the sidebar. */
  files: DiffFile[]
  mode: "local" | "pr"
  prInfo: PrInfo | null
  localTarget: string | undefined
}

export interface MultiContextResult {
  markdown: string
  includedCount: number
  bytes: number
}

/**
 * Assistant directives loaded into Claude's system prompt via
 * `--append-system-prompt-file`. Addresses two observed failure modes:
 *
 *   1. Claude running `gh pr view` to "verify" PR metadata we already ship
 *      in the context file.
 *   2. Claude `cd`ing to the context file's directory (`/tmp/…`) to run
 *      commands, which breaks because tmp isn't a git repo.
 *
 * Kept as a plain exported string so `launch.ts` can write it out verbatim.
 */
export const AI_REVIEW_SYSTEM_PROMPT = [
  "You are pair-reviewing code with the user. The user will point you at a",
  "context file containing the diff and PR metadata. Trust that file as-is —",
  "it is complete and authoritative.",
  "",
  "- Do **not** run `gh`, `git`, or any shell command to fetch PR metadata,",
  "  diffs, authors, comments, or CI status. Everything the user will ask",
  "  about is already in the context file.",
  "- Do **not** `cd` anywhere. Stay in the working directory you were",
  "  launched from (the repo root).",
  "- You may use `Read` / `Glob` / `Grep` (pre-approved) to browse related",
  "  files in the repo if the user asks you to look at something adjacent.",
  "- Answer questions directly and concisely. When the user highlights a",
  "  selection or a specific file, focus your answer there.",
  "",
].join("\n")

const NOW = () => new Date().toISOString()

/**
 * Build a markdown file describing the current file (and optional selection)
 * for Claude to read.
 */
export function buildFileContextMd(input: FileContextInput): string {
  const { file, selection, lineMapping, mode, prInfo, localTarget } = input

  const header = buildHeader({
    title: "Riff · AI Review context (file)",
    mode,
    prInfo,
    localTarget,
    extras: [`**File:** \`${file.filename}\``, `**Change:** ${describeStatus(file)}`],
  })

  let selectionBlock = ""
  if (selection && lineMapping) {
    const rawLines = extractSelectionLines(lineMapping, selection.start, selection.end)
    if (rawLines.length > 0) {
      selectionBlock = [
        "## Selection (focus this)",
        "",
        "The user highlighted these lines and wants to discuss them specifically.",
        "The full file diff follows below for additional context.",
        "",
        "```diff",
        ...rawLines,
        "```",
        "",
      ].join("\n")
    }
  }

  const fileDiffBlock = [
    `## File diff: \`${file.filename}\``,
    "",
    "```diff",
    file.content.trimEnd(),
    "```",
    "",
  ].join("\n")

  return [header, "", selectionBlock, fileDiffBlock].filter(Boolean).join("\n")
}

/**
 * Build a markdown file describing the whole review (PR or local diff),
 * skipping files in `ignoredFiles`.
 */
export function buildPrContextMd(input: PrContextInput): PrContextResult {
  const { files, ignoredFiles, mode, prInfo, localTarget } = input

  const included: DiffFile[] = []
  let skippedCount = 0
  for (const f of files) {
    if (ignoredFiles.has(f.filename)) {
      skippedCount++
      continue
    }
    included.push(f)
  }

  const scopeLabel = mode === "pr" ? "PR" : "local diff"
  const header = buildHeader({
    title: `Riff · AI Review context (full ${scopeLabel})`,
    mode,
    prInfo,
    localTarget,
    extras: [
      `**Files included:** ${included.length}` +
        (skippedCount > 0 ? ` (${skippedCount} ignored/generated skipped)` : ""),
    ],
  })

  const sections: string[] = [header, ""]

  if (mode === "pr" && prInfo && prInfo.body?.trim()) {
    sections.push("## PR description", "", prInfo.body.trim(), "")
  }

  sections.push("## Files", "")
  for (const f of included) {
    sections.push(`- \`${f.filename}\` (${describeStatus(f)}, +${f.additions} / -${f.deletions})`)
  }
  sections.push("")

  for (const f of included) {
    sections.push(`## \`${f.filename}\``, "", "```diff", f.content.trimEnd(), "```", "")
  }

  const markdown = sections.join("\n")
  return {
    markdown,
    includedCount: included.length,
    skippedCount,
    bytes: Buffer.byteLength(markdown, "utf8"),
  }
}

/**
 * Build a markdown file describing an ad-hoc multi-file selection from the
 * sidebar (the user picked N specific files via V-mode). Layout mirrors the
 * folder variant — Claude doesn't care whether the grouping is a directory
 * or a hand-picked set, only that it gets a labelled list of diffs.
 */
export function buildMultiContextMd(input: MultiContextInput): MultiContextResult {
  const { files, mode, prInfo, localTarget } = input

  const header = buildHeader({
    title: "Riff · AI Review context (selection)",
    mode,
    prInfo,
    localTarget,
    extras: [`**Selection:** ${files.length} files (hand-picked in sidebar)`],
  })

  const sections: string[] = [header, "", "## Files", ""]
  for (const f of files) {
    sections.push(`- \`${f.filename}\` (${describeStatus(f)}, +${f.additions} / -${f.deletions})`)
  }
  sections.push("")

  for (const f of files) {
    sections.push(`## \`${f.filename}\``, "", "```diff", f.content.trimEnd(), "```", "")
  }

  const markdown = sections.join("\n")
  return {
    markdown,
    includedCount: files.length,
    bytes: Buffer.byteLength(markdown, "utf8"),
  }
}

/**
 * Build a markdown file describing all the diff content for a single folder
 * (a subtree in the file panel). Shares the same layout as the full-PR one
 * but scoped to one directory.
 */
export function buildFolderContextMd(input: FolderContextInput): FolderContextResult {
  const { dirPath, files, mode, prInfo, localTarget } = input

  const header = buildHeader({
    title: `Riff · AI Review context (folder)`,
    mode,
    prInfo,
    localTarget,
    extras: [
      `**Folder:** \`${dirPath}\``,
      `**Files included:** ${files.length}`,
    ],
  })

  const sections: string[] = [header, "", "## Files", ""]
  for (const f of files) {
    sections.push(`- \`${f.filename}\` (${describeStatus(f)}, +${f.additions} / -${f.deletions})`)
  }
  sections.push("")

  for (const f of files) {
    sections.push(`## \`${f.filename}\``, "", "```diff", f.content.trimEnd(), "```", "")
  }

  const markdown = sections.join("\n")
  return {
    markdown,
    includedCount: files.length,
    bytes: Buffer.byteLength(markdown, "utf8"),
  }
}

// ---------- internals ----------

interface HeaderInput {
  title: string
  mode: "local" | "pr"
  prInfo: PrInfo | null
  localTarget: string | undefined
  extras: string[]
}

function buildHeader(input: HeaderInput): string {
  const lines: string[] = []
  lines.push(`# ${input.title}`, "")

  // Assistant directives live in the system prompt (see AI_REVIEW_SYSTEM_PROMPT),
  // not in the context file itself — launch.ts passes them via
  // `--append-system-prompt-file`. The header below is pure metadata.

  if (input.mode === "pr" && input.prInfo) {
    const p = input.prInfo
    lines.push(`**Source:** ${p.owner}/${p.repo}#${p.number} — "${p.title}"`)
    lines.push(`**Author:** ${p.author}`)
    lines.push(`**Branch:** \`${p.baseRef}\` ← \`${p.headRef}\``)
    lines.push(`**State:** ${p.state}${p.isDraft ? " (draft)" : ""}`)
    lines.push(`**URL:** ${p.url}`)
    if (p.requestedReviewers && p.requestedReviewers.length > 0) {
      lines.push(`**Requested reviewers:** ${p.requestedReviewers.join(", ")}`)
    }
    if (typeof p.additions === "number" && typeof p.deletions === "number") {
      lines.push(`**Size:** +${p.additions} / -${p.deletions} across ${p.changedFiles} file(s)`)
    }
  } else {
    lines.push(`**Source:** local diff`)
    if (input.localTarget) {
      lines.push(`**Target:** \`${input.localTarget}\``)
    }
  }

  lines.push(`**Generated:** ${NOW()}`)
  for (const e of input.extras) lines.push(e)
  lines.push("", "---")
  return lines.join("\n")
}

function describeStatus(f: DiffFile): string {
  switch (f.status) {
    case "added":
      return "added"
    case "deleted":
      return "deleted"
    case "renamed":
      return f.oldFilename ? `renamed from \`${f.oldFilename}\`` : "renamed"
    case "modified":
    default:
      return "modified"
  }
}

/**
 * Extract raw diff lines from the visual line mapping between [start, end] (inclusive).
 * Skips synthetic entries (file-header, divider, spacing) and returns only lines
 * that exist in the underlying diff.
 */
function extractSelectionLines(
  lineMapping: DiffLineMapping,
  start: number,
  end: number,
): string[] {
  const out: string[] = []
  const lo = Math.max(0, Math.min(start, end))
  const hi = Math.min(lineMapping.lineCount - 1, Math.max(start, end))
  for (let i = lo; i <= hi; i++) {
    const line = lineMapping.getLine(i)
    if (!line) continue
    if (
      line.type === "file-header" ||
      line.type === "divider" ||
      line.type === "spacing"
    ) {
      continue
    }
    // rawLine may be empty for synthetic nodes; fall back to content.
    out.push(line.rawLine || line.content)
  }
  return out
}
