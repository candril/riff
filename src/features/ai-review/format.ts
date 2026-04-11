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
 * Placeholder replaced per-launch with the absolute draft-comment.json path
 * for the current PR's context dir. `handlers.ts::writeSystemPromptFile`
 * does the substitution before writing the system-prompt file to disk.
 * Kept as a distinctive token so a typo in the prompt template can't
 * accidentally be interpreted as a real path.
 */
export const DRAFT_PATH_PLACEHOLDER = "{{DRAFT_COMMENT_PATH}}"

/**
 * Project-scoped Claude Code slash command installed by riff at each AI
 * Review launch. Lives at `<repoRoot>/.claude/commands/riff-comment.md`
 * and is deleted on riff exit (best-effort — crash residue stays until
 * the next clean launch).
 *
 * It intentionally does **not** repeat the drafting protocol — the system
 * prompt already carries that. The command just gives Claude a fast,
 * unambiguous trigger with the user's feedback already baked into the
 * prompt via `$ARGUMENTS`.
 *
 * `disable-model-invocation: true` keeps Claude from calling this command
 * on its own without the user typing `/riff-comment` explicitly.
 */
export const RIFF_COMMENT_COMMAND = `---
name: riff-comment
description: Draft an inline PR review comment for riff to post (spec 036)
disable-model-invocation: true
---

You're pair-reviewing a PR with the user inside riff. They want you to
turn a piece of feedback into an inline PR review comment that riff will
post under their identity.

Follow the drafting protocol from your system prompt — the draft path,
JSON schema, and "don't run gh" rules are already defined there. Do not
repeat them back and do not ask for them.

Be fast:

1. If the context file has a \`## Draft anchor\` section, use those
   \`filename\` / \`side\` / \`line\` / \`startLine\` values verbatim. They
   reflect the visual-line selection the user made in riff and are
   already GitHub-compatible.
2. Otherwise, look at the diff in your review-context file to pick the
   exact file and line numbers. Use the \`+\` side (\`RIGHT\`) unless the
   feedback is about a deleted line.
3. If the feedback below reads like a concrete replacement ("rename to",
   "inline this", "replace with", "use pattern"), draft it as a **code
   suggestion** (\`\`\`suggestion fence in the body, range covers the
   exact lines being replaced). Otherwise, draft a plain comment
   anchored at the first row of the selection.
4. Write the draft JSON immediately and then tell the user:
   "Draft written — press \`gd\` in riff to review, or Ctrl+p → Review
   drafted comment."
5. If it's ambiguous which lines are meant (and no Draft anchor section
   exists), ask **one** clarifying question before drafting. Don't
   deliberate beyond that.

Do not run \`gh\`, \`git\`, or any shell command to post. Riff will post
the comment after the user explicitly approves.

User feedback to turn into a review comment:
$ARGUMENTS
`

/**
 * Assistant directives loaded into Claude's system prompt via
 * `--append-system-prompt-file`. Addresses observed failure modes:
 *
 *   1. Claude running `gh pr view` to "verify" PR metadata we already ship
 *      in the context file.
 *   2. Claude `cd`ing to the context file's directory (`/tmp/…`) to run
 *      commands, which breaks because tmp isn't a git repo.
 *
 * Also contains the "draft a review comment" protocol (spec 036): when the
 * user asks for a review comment to be drafted, Claude writes a strict JSON
 * blob to `DRAFT_PATH_PLACEHOLDER` (substituted per-launch). Riff's
 * background poller detects the file and surfaces a notification.
 *
 * Kept as a plain exported string so `handlers.ts` can write it out verbatim.
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
  "## Drafting a review comment for riff to post",
  "",
  "**Fast path**: the user can invoke `/riff-comment <their feedback>` as a",
  "slash command. That command already wraps their feedback in the right",
  "prompt — when you see it, just follow the protocol below without asking",
  "for clarification unless the lines are genuinely ambiguous.",
  "",
  "When the user asks you to **draft a review comment** (via the slash",
  "command or free-form: \"write this up as a comment\", \"draft a review",
  "comment\", \"turn this into feedback\"),",
  `save the draft to \`${DRAFT_PATH_PLACEHOLDER}\` using this exact JSON schema:`,
  "",
  "```json",
  "{",
  "  \"kind\": \"inline\",",
  "  \"filename\": \"<path, copied verbatim from the context file>\",",
  "  \"side\": \"RIGHT\",",
  "  \"line\": <end line number from the diff>,",
  "  \"startLine\": <optional inclusive start line for multi-line ranges>,",
  "  \"body\": \"<your comment text, markdown allowed>\",",
  "  \"draftedAt\": \"<current ISO-8601 timestamp>\"",
  "}",
  "```",
  "",
  "Rules:",
  "- `filename` and the line numbers **must** come from the diff in the",
  "  context file. Do not guess. Use the `+` side (`RIGHT`) unless the user",
  "  is pointing at a deleted line, in which case use `LEFT`.",
  "- **If the context file contains a `## Draft anchor` section, use the",
  "  values from that section verbatim.** Riff computed them from the",
  "  user's visual-line selection and they already reflect the exact",
  "  GitHub-compatible lines the comment should anchor to. Do not",
  "  second-guess the anchor — if you disagree with the lines, say so in",
  "  the chat instead of picking different numbers.",
  "- If there's **no** Draft anchor section and the user's feedback isn't",
  "  tied to a specific line in the diff, ask them to narrow it down —",
  "  do **not** invent a line number.",
  "- `startLine` is optional: include it only when the comment spans more",
  "  than one line. `startLine` must be <= `line` and on the same side.",
  "- After saving the draft, tell the user: \"Draft written. Riff will show",
  "  a notification — approve it there.\"",
  "- Do **not** run `gh`, `git`, or any other shell command to post the",
  "  comment. Riff will post it under the user's identity after they",
  "  explicitly approve.",
  "- If the user asks you to revise the draft, simply overwrite the same",
  "  file — riff picks up the new contents on its next poll tick.",
  "",
  "### Code suggestion comments (GitHub \"Apply suggestion\")",
  "",
  "When the user wants to suggest a specific replacement for some code",
  "(\"rename this to X\", \"inline this\", \"replace with …\", \"use pattern Y",
  "instead\"), draft the comment as a **GitHub code suggestion**. These",
  "render as a one-click \"Commit suggestion\" button in the PR UI.",
  "",
  "Format:",
  "",
  "- `kind` stays `\"inline\"`.",
  "- `startLine` and `line` must cover **exactly** the lines that should",
  "  be replaced, on the same side, in new-file numbering when `side` is",
  "  `RIGHT`. For a single-line replacement, set `line` to that line and",
  "  omit `startLine`.",
  "- `body` is a short prose explanation followed by a fenced block with",
  "  the language `suggestion`:",
  "",
  "  ```",
  "  Short explanation of why.",
  "",
  "  ```suggestion",
  "  new line 1",
  "  new line 2",
  "  ```",
  "  ```",
  "",
  "- The suggestion block's content replaces the lines from `startLine`",
  "  to `line` inclusive. Do **not** include a leading/trailing newline",
  "  inside the fence unless you mean to add a blank line to the file.",
  "- If the context file's `## Draft anchor` section lists specific",
  "  `startLine` / `line` values for suggestions, use those — they map",
  "  the user's selection to the replacement range.",
  "- Use suggestions sparingly: only when the replacement is short and",
  "  mechanical. For larger refactors, prefer a plain comment describing",
  "  the change.",
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
  let anchorBlock = ""
  if (selection && lineMapping) {
    const rawLines = extractSelectionLines(lineMapping, selection.start, selection.end)
    const anchor = extractSelectionAnchor(
      lineMapping,
      file.filename,
      selection.start,
      selection.end,
    )
    if (anchor) {
      anchorBlock = buildDraftAnchorBlock(anchor, file.filename)
    }
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

  return [header, "", anchorBlock, selectionBlock, fileDiffBlock]
    .filter(Boolean)
    .join("\n")
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

/**
 * GitHub-compatible anchor info for the current visual-line selection.
 * `startLine` and `endLine` are real new-file (or old-file) line numbers
 * derived via the DiffLineMapping — not visual indices. This is what the
 * draft JSON should reference, so the posted comment lands on exactly
 * the lines the user highlighted.
 */
interface SelectionAnchor {
  side: "LEFT" | "RIGHT"
  startLine: number
  endLine: number
}

/**
 * Walk a visual-line selection and pull out the first/last GitHub-anchorable
 * line numbers. Side is picked by content:
 *
 *   - If the selection contains any `addition` or `context` lines → RIGHT
 *     (use new-file numbers). This is the common case; additions and
 *     context are both commentable on the right side.
 *   - If the selection is entirely `deletion` lines → LEFT (use old-file
 *     numbers). Deletions only exist on the left.
 *
 * Mixed-side selections that contain both additions and deletions fall
 * back to RIGHT — the GitHub API can't anchor a single comment across
 * both sides, so we pick the one the user is most likely commenting on.
 *
 * Returns null when the selection doesn't touch the given file or has
 * no commentable rows (e.g. dividers only).
 */
function extractSelectionAnchor(
  lineMapping: DiffLineMapping,
  filename: string,
  start: number,
  end: number,
): SelectionAnchor | null {
  const lo = Math.max(0, Math.min(start, end))
  const hi = Math.min(lineMapping.lineCount - 1, Math.max(start, end))

  let firstRight: number | null = null
  let lastRight: number | null = null
  let firstLeft: number | null = null
  let lastLeft: number | null = null
  let hasAdd = false
  let hasDel = false
  let hasCtx = false

  for (let i = lo; i <= hi; i++) {
    const line = lineMapping.getLine(i)
    if (!line || line.filename !== filename) continue
    if (line.type === "addition") hasAdd = true
    else if (line.type === "deletion") hasDel = true
    else if (line.type === "context") hasCtx = true
    else continue

    if (line.newLineNum !== undefined) {
      if (firstRight === null) firstRight = line.newLineNum
      lastRight = line.newLineNum
    }
    if (line.oldLineNum !== undefined) {
      if (firstLeft === null) firstLeft = line.oldLineNum
      lastLeft = line.oldLineNum
    }
  }

  // Deletion-only selection → LEFT side (only place deletions live).
  if (hasDel && !hasAdd && !hasCtx && firstLeft !== null && lastLeft !== null) {
    return { side: "LEFT", startLine: firstLeft, endLine: lastLeft }
  }
  // Everything else → RIGHT side (additions + context, or mixed).
  if (firstRight !== null && lastRight !== null) {
    return { side: "RIGHT", startLine: firstRight, endLine: lastRight }
  }
  return null
}

/**
 * Render the "## Draft anchor" context-file section that pins the Claude
 * draft to the exact lines the user highlighted. Called from
 * `buildFileContextMd` when a visual selection is active.
 *
 * Encodes two drafting modes:
 *
 *  - **Plain comment**: anchor at `startLine` as a single-line comment
 *    so the GitHub UI shows the comment where the user started
 *    highlighting (not at the end, which is where ranged comments
 *    anchor by default).
 *  - **Code suggestion** (```suggestion fence): use the full range so
 *    the suggestion replaces exactly the highlighted lines.
 */
function buildDraftAnchorBlock(anchor: SelectionAnchor, filename: string): string {
  const sameLine = anchor.startLine === anchor.endLine
  const rangeDesc = sameLine
    ? `line ${anchor.startLine}`
    : `lines ${anchor.startLine}-${anchor.endLine}`
  return [
    "## Draft anchor (GitHub line numbers for the selection)",
    "",
    `The user's selection covers **${rangeDesc}** on the **${anchor.side}** side of`,
    `\`${filename}\`. When you draft a review comment for this selection,`,
    "these are the exact field values to use — do **not** pick other lines.",
    "",
    "**Plain review comment** (the usual case):",
    "",
    `- \`filename\`: \`${filename}\``,
    `- \`side\`: \`"${anchor.side}"\``,
    `- \`line\`: \`${anchor.startLine}\`  ← **first row of the selection**`,
    "- omit `startLine`  (single-line anchor; your body can still discuss",
    "  the whole selected block, but the GitHub comment appears at the",
    "  first highlighted line)",
    "",
    ...(sameLine
      ? []
      : [
          "**Code suggestion** (body contains a ```suggestion fence):",
          "",
          `- \`filename\`: \`${filename}\``,
          `- \`side\`: \`"${anchor.side}"\``,
          `- \`startLine\`: \`${anchor.startLine}\``,
          `- \`line\`: \`${anchor.endLine}\`  ← last row, so the suggestion replaces the full range`,
          "",
        ]),
  ].join("\n")
}
