/**
 * The buffers riff hands $EDITOR to edit or create a pull request, laid out
 * like `git commit --verbose`, and how it reads them back.
 */

const PR_EDIT_SCISSORS = "# ------------------------ >8 ------------------------"
const PR_EDIT_COMMENT_PREFIX = "# "

export interface PrEditOptions {
  /** Current PR title */
  title: string
  /** Current PR description/body */
  body: string
  /** Raw unified diff of all changes (shown below scissors line) */
  diff: string
  /** File summary lines (e.g., "M src/app.ts") */
  fileSummary?: string[]
}

export interface PrEditResult {
  /** The new title (first non-comment, non-empty line) */
  title: string
  /** The new description (everything after first blank line, before scissors) */
  body: string
}

/**
 * Build the editor file content for PR title/description editing.
 * Format follows git commit --verbose conventions:
 *
 *   PR title here
 *
 *   PR description here
 *   (can be multiple lines/paragraphs)
 *
 *   # ------------------------ >8 ------------------------
 *   # Do not modify or remove the line above.
 *   # Everything below it will be ignored.
 *   #
 *   # Files changed:
 *   #   M src/app.ts
 *   #   A src/new-file.ts
 *   #
 *   diff --git a/src/app.ts b/src/app.ts
 *   ...
 */
export function buildPrEditContent(options: PrEditOptions): string {
  const lines: string[] = []

  lines.push(options.title)
  lines.push("")

  if (options.body.trim()) {
    lines.push(options.body)
    if (!options.body.endsWith("\n")) {
      lines.push("")
    }
  }

  lines.push(PR_EDIT_SCISSORS)
  lines.push(`${PR_EDIT_COMMENT_PREFIX}Do not modify or remove the line above.`)
  lines.push(`${PR_EDIT_COMMENT_PREFIX}Everything below it will be ignored.`)
  lines.push(PR_EDIT_COMMENT_PREFIX)

  if (options.fileSummary && options.fileSummary.length > 0) {
    lines.push(`${PR_EDIT_COMMENT_PREFIX}Files changed:`)
    for (const file of options.fileSummary) {
      lines.push(`${PR_EDIT_COMMENT_PREFIX}  ${file}`)
    }
    lines.push(PR_EDIT_COMMENT_PREFIX)
  }

  // Full diff (not commented — syntax highlighting works)
  lines.push(options.diff)

  return lines.join("\n")
}

/**
 * Parse the editor output for PR title/description.
 * Strips everything at/after the scissors line and comment lines.
 * First line = title, rest = body.
 */
export function parsePrEditOutput(content: string): PrEditResult | null {
  const scissorsIdx = content.indexOf(PR_EDIT_SCISSORS)
  const editable = scissorsIdx !== -1 ? content.slice(0, scissorsIdx) : content

  const lines = editable.split("\n")

  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") {
    lines.pop()
  }

  if (lines.length === 0) {
    return null // Empty = cancelled
  }

  const title = lines[0]!.trim()
  if (!title) {
    return null // No title = cancelled
  }

  let bodyStart = 1
  while (bodyStart < lines.length && lines[bodyStart]!.trim() === "") {
    bodyStart++
  }

  const body = lines.slice(bodyStart).join("\n").trimEnd()

  return { title, body }
}

export interface PrCreateOptions {
  /** Raw unified diff of all changes (shown below scissors line) */
  diff: string
  /** File summary lines (e.g., "M src/app.ts") */
  fileSummary?: string[]
  /** Branch info (e.g., "my-feature → main") */
  branchInfo?: string | null
}

export interface PrCreateResult {
  /** The PR title (first non-empty line) */
  title: string
  /** The PR description (everything after first blank line, before Draft/scissors) */
  body: string
  /** Whether to create as draft */
  draft: boolean
}

/**
 * Build the editor file content for PR creation.
 * Format:
 *
 *   <title here>
 *
 *   <body here>
 *
 *   # Draft: no
 *   # ------------------------ >8 ------------------------
 *   # Do not modify or remove the line above.
 *   # Everything below it will be ignored.
 *   #
 *   # Creating PR for branch: my-feature → main
 *   #
 *   # Files changed:
 *   #   M src/app.ts
 *   #   A src/new-file.ts
 *   #
 *   diff --git a/src/app.ts b/src/app.ts
 *   ...
 */
export function buildPrCreateContent(options: PrCreateOptions): string {
  const lines: string[] = []

  lines.push("")
  lines.push("")
  lines.push("")

  lines.push("# Draft: no")

  lines.push(PR_EDIT_SCISSORS)
  lines.push(`${PR_EDIT_COMMENT_PREFIX}Do not modify or remove the line above.`)
  lines.push(`${PR_EDIT_COMMENT_PREFIX}Everything below it will be ignored.`)
  lines.push(PR_EDIT_COMMENT_PREFIX)

  if (options.branchInfo) {
    lines.push(`${PR_EDIT_COMMENT_PREFIX}Creating PR for: ${options.branchInfo}`)
    lines.push(PR_EDIT_COMMENT_PREFIX)
  }

  if (options.fileSummary && options.fileSummary.length > 0) {
    lines.push(`${PR_EDIT_COMMENT_PREFIX}Files changed:`)
    for (const file of options.fileSummary) {
      lines.push(`${PR_EDIT_COMMENT_PREFIX}  ${file}`)
    }
    lines.push(PR_EDIT_COMMENT_PREFIX)
  }

  // Full diff (not commented — syntax highlighting works)
  lines.push(options.diff)

  return lines.join("\n")
}

/**
 * Parse the editor output for PR creation.
 * Extracts title, body, and draft flag.
 * Returns null if title is empty (cancelled).
 */
export function parsePrCreateOutput(content: string): PrCreateResult | null {
  const scissorsIdx = content.indexOf(PR_EDIT_SCISSORS)
  const editable = scissorsIdx !== -1 ? content.slice(0, scissorsIdx) : content

  let draft = false
  const draftMatch = editable.match(/^#\s*Draft:\s*(yes|no)\s*$/mi)
  if (draftMatch) {
    draft = draftMatch[1]!.toLowerCase() === "yes"
  }

  // The draft flag is a #-line too, so it goes with the comments once read.
  const lines = editable.split("\n").filter(line => !line.match(/^\s*#/))

  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") {
    lines.pop()
  }

  if (lines.length === 0) {
    return null // Empty = cancelled
  }

  let titleIdx = 0
  while (titleIdx < lines.length && lines[titleIdx]!.trim() === "") {
    titleIdx++
  }

  if (titleIdx >= lines.length) {
    return null // No title = cancelled
  }

  const title = lines[titleIdx]!.trim()
  if (!title) {
    return null
  }

  let bodyStart = titleIdx + 1
  while (bodyStart < lines.length && lines[bodyStart]!.trim() === "") {
    bodyStart++
  }

  const body = lines.slice(bodyStart).join("\n").trimEnd()

  return { title, body, draft }
}
