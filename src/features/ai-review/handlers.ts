/**
 * AI-assisted review actions.
 *
 * Two palette entries under the "Claude" category:
 *   - claude-discuss:      context-aware — discusses the current selection,
 *                          the highlighted folder, or the current file,
 *                          whichever scope is active. Its label in the palette
 *                          changes to match ("Discuss selection" / "Discuss
 *                          folder" / "Discuss file").
 *   - claude-discuss-full: discusses the whole diff (PR or local), minus
 *                          ignored files.
 *
 * Each writes a deterministic markdown context file under
 * `.git/riff-ai-review/` (or `.jj/…` for standalone jj), organised per
 * repo/PR so re-opening the same scope overwrites rather than accumulating,
 * then launches `claude` either in a tmux split pane or inline.
 */

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { PrInfo } from "../../providers/github"
import type { DiffFile } from "../../utils/diff-parser"
import { showToast, clearToast, clearTreeSelectionAnchor } from "../../state"
import { getVisibleFlatTreeItems } from "../../components"
import {
  buildFileContextMd,
  buildPrContextMd,
  buildFolderContextMd,
  buildMultiContextMd,
  AI_REVIEW_SYSTEM_PROMPT,
  DRAFT_PATH_PLACEHOLDER,
  RIFF_COMMENT_COMMAND,
} from "./format"
import { launchClaudeWithContext } from "./launch"
import {
  detectReviewScope,
  collectFilesUnderDirectory,
  collectMultiSelectionFiles,
} from "./scope"

const PR_SIZE_WARN_BYTES = 200 * 1024 // 200 KB

export interface AiReviewContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  getLineMapping: () => DiffLineMapping
  render: () => void
  suspendRenderer: () => void
  resumeRenderer: () => void
  mode: "local" | "pr"
  prInfo: PrInfo | null
  options: { target?: string }
}

// ---------- context-aware action ----------

/**
 * Dispatch on the currently-detected scope and run the matching handler.
 * The palette label already shows the user which scope is active, so this
 * just funnels to the right concrete handler.
 */
export async function handleAiReviewContextAware(
  ctx: AiReviewContext,
): Promise<void> {
  const scope = detectReviewScope(ctx.getState(), ctx.getVimState())
  switch (scope.kind) {
    case "selection":
    case "file":
      await handleFileOrSelection(ctx)
      return
    case "folder":
      await handleFolder(ctx)
      return
    case "multi":
      await handleMulti(ctx)
      return
    case "none":
      ctx.setState((s) => showToast(s, "Nothing to review", "info"))
      ctx.render()
      scheduleToastClear(ctx)
      return
  }
}

// ---------- file / selection ----------

/**
 * Resolve which file the user is "on" right now. Mirrors the logic used by
 * external-tools/handlers.ts:getCurrentFile, but returns the DiffFile itself
 * so we can pass it straight to the formatter.
 */
function resolveCurrentFile(ctx: AiReviewContext): DiffFile | null {
  const state = ctx.getState()
  const lineMapping = ctx.getLineMapping()
  const vimState = ctx.getVimState()

  const findByName = (name: string): DiffFile | null =>
    state.files.find((f) => f.filename === name) ?? null

  if (state.focusedPanel === "tree") {
    const flatItems = getVisibleFlatTreeItems(
      state.fileTree,
      state.files,
      state.ignoredFiles,
      state.showHiddenFiles,
    )
    const highlighted = flatItems[state.treeHighlightIndex]
    if (highlighted && !highlighted.node.isDirectory) {
      return findByName(highlighted.node.path)
    }
    return null
  }

  if (state.selectedFileIndex !== null) {
    return state.files[state.selectedFileIndex] ?? null
  }

  // All-files view — resolve via the line under the cursor.
  const line = lineMapping.getLine(vimState.line)
  if (line?.filename) return findByName(line.filename)
  return null
}

/**
 * If the user is in visual-line mode and the selection sits inside the given
 * file, return the [start, end] visual indices (normalised). Otherwise null.
 *
 * Cross-file selections fall back to "no selection" — Claude then just gets
 * the file diff, which is the least-surprising behaviour.
 */
function resolveSelectionInFile(
  ctx: AiReviewContext,
  file: DiffFile,
): { start: number; end: number } | null {
  const vimState = ctx.getVimState()
  if (vimState.mode !== "visual-line" || vimState.selectionAnchor === null) return null

  const lineMapping = ctx.getLineMapping()
  const start = Math.min(vimState.selectionAnchor, vimState.line)
  const end = Math.max(vimState.selectionAnchor, vimState.line)

  // Require at least one line in the selection to belong to this file.
  let touchesFile = false
  for (let i = start; i <= end; i++) {
    const line = lineMapping.getLine(i)
    if (line?.filename === file.filename) {
      touchesFile = true
      break
    }
  }
  if (!touchesFile) return null

  return { start, end }
}

async function handleFileOrSelection(ctx: AiReviewContext): Promise<void> {
  const file = resolveCurrentFile(ctx)
  if (!file) {
    ctx.setState((s) => showToast(s, "No file selected", "info"))
    ctx.render()
    scheduleToastClear(ctx)
    return
  }

  const selection = resolveSelectionInFile(ctx, file)
  const state = ctx.getState()

  const markdown = buildFileContextMd({
    file,
    selection,
    lineMapping: selection ? ctx.getLineMapping() : null,
    mode: ctx.mode,
    prInfo: ctx.prInfo,
    localTarget: ctx.options.target,
  })

  const path = writeContextFile({
    mode: ctx.mode,
    prInfo: ctx.prInfo,
    source: state.source,
    kind: "file",
    filename: file.filename,
    content: markdown,
  })

  const label = selection ? "selection" : "file"
  ctx.setState((s) => showToast(s, `Opening Claude with ${label}: ${file.filename}`, "info"))
  ctx.render()

  await launchSafely(ctx, path)
}

// ---------- folder ----------

/**
 * Resolve the directory path the user has highlighted in the file tree.
 * Returns null if the tree isn't focused or the highlight isn't on a dir.
 */
function resolveHighlightedDirectory(ctx: AiReviewContext): string | null {
  const state = ctx.getState()
  if (state.focusedPanel !== "tree") return null
  const flatItems = getVisibleFlatTreeItems(
    state.fileTree,
    state.files,
    state.ignoredFiles,
    state.showHiddenFiles,
  )
  const highlighted = flatItems[state.treeHighlightIndex]
  if (!highlighted?.node.isDirectory) return null
  return highlighted.node.path
}

async function handleFolder(ctx: AiReviewContext): Promise<void> {
  const dirPath = resolveHighlightedDirectory(ctx)
  if (!dirPath) {
    ctx.setState((s) => showToast(s, "No folder highlighted", "info"))
    ctx.render()
    scheduleToastClear(ctx)
    return
  }

  const state = ctx.getState()
  const files = collectFilesUnderDirectory(state.files, state.ignoredFiles, dirPath)

  if (files.length === 0) {
    ctx.setState((s) => showToast(s, `No reviewable files in ${dirPath}`, "info"))
    ctx.render()
    scheduleToastClear(ctx, 2500)
    return
  }

  const built = buildFolderContextMd({
    dirPath,
    files,
    mode: ctx.mode,
    prInfo: ctx.prInfo,
    localTarget: ctx.options.target,
  })

  if (built.bytes > PR_SIZE_WARN_BYTES) {
    const kb = Math.round(built.bytes / 1024)
    ctx.setState((s) =>
      showToast(s, `Folder diff is ${kb} KB — large context, Claude may struggle`, "info"),
    )
    ctx.render()
  }

  const path = writeContextFile({
    mode: ctx.mode,
    prInfo: ctx.prInfo,
    source: state.source,
    kind: "folder",
    filename: dirPath,
    content: built.markdown,
  })

  ctx.setState((s) =>
    showToast(s, `Opening Claude with folder: ${dirPath} (${files.length} files)`, "info"),
  )
  ctx.render()

  await launchSafely(ctx, path)
}

// ---------- multi-file selection ----------

async function handleMulti(ctx: AiReviewContext): Promise<void> {
  const state = ctx.getState()

  // Re-collect the selection here (we can't trust the scope detector's count
  // to still be accurate by the time this runs — state could have changed).
  const flatItems = getVisibleFlatTreeItems(
    state.fileTree,
    state.files,
    state.ignoredFiles,
    state.showHiddenFiles,
  )
  const files = collectMultiSelectionFiles(state, flatItems)

  if (files.length === 0) {
    ctx.setState((s) => showToast(s, "No files in selection", "info"))
    ctx.render()
    scheduleToastClear(ctx)
    return
  }

  const built = buildMultiContextMd({
    files,
    mode: ctx.mode,
    prInfo: ctx.prInfo,
    localTarget: ctx.options.target,
  })

  if (built.bytes > PR_SIZE_WARN_BYTES) {
    const kb = Math.round(built.bytes / 1024)
    ctx.setState((s) =>
      showToast(s, `Selection is ${kb} KB — large context, Claude may struggle`, "info"),
    )
    ctx.render()
  }

  const path = writeContextFile({
    mode: ctx.mode,
    prInfo: ctx.prInfo,
    source: state.source,
    kind: "multi",
    content: built.markdown,
  })

  // Clear the tree multi-select anchor now that we've consumed it. The user
  // asked for actions to discard the selection on execute (mirrors how `v`
  // bulk-mark also clears).
  ctx.setState(clearTreeSelectionAnchor)
  ctx.setState((s) =>
    showToast(s, `Opening Claude with selection (${files.length} files)`, "info"),
  )
  ctx.render()

  await launchSafely(ctx, path)
}

// ---------- full PR ----------

export async function handleAiReviewFull(ctx: AiReviewContext): Promise<void> {
  const state = ctx.getState()

  if (state.files.length === 0) {
    ctx.setState((s) => showToast(s, "Nothing to review", "info"))
    ctx.render()
    scheduleToastClear(ctx)
    return
  }

  const built = buildPrContextMd({
    files: state.files,
    ignoredFiles: state.ignoredFiles,
    mode: ctx.mode,
    prInfo: ctx.prInfo,
    localTarget: ctx.options.target,
  })

  if (built.includedCount === 0) {
    ctx.setState((s) =>
      showToast(s, `All ${built.skippedCount} files are ignored — nothing to send`, "info"),
    )
    ctx.render()
    scheduleToastClear(ctx, 2500)
    return
  }

  if (built.bytes > PR_SIZE_WARN_BYTES) {
    const kb = Math.round(built.bytes / 1024)
    // Single-shot in-toast warning. We deliberately don't implement a full
    // modal confirm here: the user can just cancel the action by not invoking
    // it again, and a modal would need more plumbing than the payoff warrants.
    // Surface the size and keep going.
    ctx.setState((s) =>
      showToast(s, `PR diff is ${kb} KB — large context, Claude may struggle`, "info"),
    )
    ctx.render()
  }

  const path = writeContextFile({
    mode: ctx.mode,
    prInfo: ctx.prInfo,
    source: state.source,
    kind: "full",
    content: built.markdown,
  })

  const scope = ctx.mode === "pr" && ctx.prInfo ? `PR #${ctx.prInfo.number}` : "diff"
  const suffix =
    built.skippedCount > 0
      ? ` (${built.includedCount} files, ${built.skippedCount} skipped)`
      : ` (${built.includedCount} files)`
  ctx.setState((s) => showToast(s, `Opening Claude with ${scope}${suffix}`, "info"))
  ctx.render()

  await launchSafely(ctx, path)
}

// ---------- shared launch + error handling ----------

async function launchSafely(ctx: AiReviewContext, path: string): Promise<void> {
  try {
    // Compute the draft-comment path for this PR scope and bake it into
    // the system prompt so Claude knows exactly where to write. Local mode
    // gets a scope-specific path too — Claude rarely drafts there, but the
    // prompt still needs a concrete path to reference.
    const state = ctx.getState()
    const draftPath = draftPathFor({
      mode: ctx.mode,
      prInfo: ctx.prInfo,
      source: state.source,
    })
    const systemPromptPath = writeSystemPromptFile(draftPath)

    // Install the `/riff-comment` slash command (spec 036) into the
    // project-scoped commands dir. Overwrites on every launch so edits
    // to RIFF_COMMENT_COMMAND ship immediately. Cleanup is registered
    // lazily so it fires once on riff exit regardless of how many times
    // the user launches AI Review.
    ensureRiffCommentCommandInstalled()

    // Make sure the parent dir exists so Claude's pre-authorized Write
    // grant lands without a "permission denied" if the user hasn't
    // opened AI Review for this PR yet.
    mkdirSync(dirname(draftPath), { recursive: true })

    await launchClaudeWithContext(path, systemPromptPath, draftPath, {
      suspendRenderer: ctx.suspendRenderer,
      resumeRenderer: ctx.resumeRenderer,
      render: ctx.render,
    })
    ctx.setState(clearToast)
    ctx.render()
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    ctx.setState((s) => showToast(s, `Failed to launch Claude: ${msg}`, "error"))
    ctx.render()
    scheduleToastClear(ctx, 3000)
  }
}

// ---------- /riff-comment slash command install ----------

/**
 * Absolute path of the project-scoped `/riff-comment` command file. Cached
 * on first install so the cleanup hook can delete it without recomputing.
 */
let riffCommentCommandPath: string | null = null
let cleanupRegistered = false

function riffCommentCommandFilePath(): string {
  return join(process.cwd(), ".claude", "commands", "riff-comment.md")
}

/**
 * Write `<cwd>/.claude/commands/riff-comment.md` and register a process
 * exit hook to remove it on clean shutdown. Idempotent — calling this
 * multiple times per session only triggers one registration.
 *
 * The file is intentionally project-scoped (not `~/.claude/commands/`):
 * Claude Code has no `--commands-dir` flag and `CLAUDE_CONFIG_DIR`
 * redirects auth/settings too, so true session-scoping isn't available.
 * Project-scoped keeps the residue contained to the repo the user is
 * actively reviewing, and the exit hook removes it on clean shutdown.
 *
 * Residue surfaces only if riff crashes; the file is a single
 * well-named markdown the user can trivially delete.
 */
function ensureRiffCommentCommandInstalled(): void {
  const path = riffCommentCommandFilePath()
  try {
    mkdirSync(join(process.cwd(), ".claude", "commands"), { recursive: true })
    writeFileSync(path, RIFF_COMMENT_COMMAND, "utf8")
    riffCommentCommandPath = path
  } catch {
    // Best-effort. Couldn't write (permissions, read-only fs, etc.) —
    // the drafting protocol in the system prompt still works, just without
    // the `/riff-comment` fast path.
    return
  }

  if (!cleanupRegistered) {
    cleanupRegistered = true
    const cleanup = (): void => {
      if (riffCommentCommandPath === null) return
      try {
        unlinkSync(riffCommentCommandPath)
      } catch {
        // File already gone or not writable — nothing to do.
      }
      riffCommentCommandPath = null
    }
    // Fires on normal Node.js shutdown and on re-thrown uncaught
    // exceptions. SIGINT/SIGTERM don't auto-trigger `exit`, so we wire
    // those explicitly.
    process.on("exit", cleanup)
    process.on("SIGINT", () => {
      cleanup()
      process.exit(130)
    })
    process.on("SIGTERM", () => {
      cleanup()
      process.exit(143)
    })
  }
}

/**
 * Write the review directives to a file claude can load via
 * `--append-system-prompt-file`. Always overwritten — the content is
 * effectively a compile-time constant with one per-launch substitution
 * (the draft-comment path), so a stale file from a previous version or a
 * different PR gets refreshed on next launch.
 *
 * Lives at the root of `.git/riff-ai-review/` (not inside a per-PR scope
 * dir) so the `--append-system-prompt-file` flag always points at the
 * same well-known location.
 */
function writeSystemPromptFile(draftPath: string): string {
  const root = resolveContextRoot()
  mkdirSync(root, { recursive: true })
  const path = join(root, "system-prompt.md")
  const prompt = AI_REVIEW_SYSTEM_PROMPT.replaceAll(
    DRAFT_PATH_PLACEHOLDER,
    draftPath,
  )
  writeFileSync(path, prompt, "utf8")
  return path
}

/**
 * Compute the absolute path where Claude is instructed to write the
 * drafted PR comment, for the current scope. Exported so the post-draft
 * handler and the background poller can check for the file's existence
 * without re-deriving the slugging rules.
 *
 * Return is deterministic for a given (mode, prInfo, source) tuple and
 * matches the directory layout in `writeContextFile`.
 */
export function draftPathFor(input: {
  mode: "local" | "pr"
  prInfo: PrInfo | null
  source: string
}): string {
  const root = resolveContextRoot()
  const scope = scopeDirName(input.mode, input.prInfo, input.source)
  return join(root, scope, "draft-comment.json")
}

/**
 * Pick the directory that holds all AI-review scratch files.
 *
 * Preference order:
 *   1. `<cwd>/.git/riff-ai-review` — works for git repos and jj+git
 *      colocated setups (the common case).
 *   2. `<cwd>/.jj/riff-ai-review`  — standalone jj repos without .git.
 *   3. `<cwd>/.riff-ai-review`     — last-ditch fallback if riff is ever
 *      launched outside a VCS (shouldn't happen in practice). User would
 *      need to .gitignore it manually, but riff bails out much earlier
 *      without a VCS anyway.
 *
 * We put files inside cwd on purpose: claude already trusts cwd, so this
 * avoids the `--add-dir` trust prompt on every launch.
 */
function resolveContextRoot(): string {
  const cwd = process.cwd()
  if (existsSync(join(cwd, ".git"))) return join(cwd, ".git", "riff-ai-review")
  if (existsSync(join(cwd, ".jj"))) return join(cwd, ".jj", "riff-ai-review")
  return join(cwd, ".riff-ai-review")
}

// ---------- path + fs helpers ----------

interface WriteInput {
  mode: "local" | "pr"
  prInfo: PrInfo | null
  source: string
  kind: "file" | "folder" | "full" | "multi"
  filename?: string
  content: string
}

/**
 * Compute a deterministic path for the context file and write it.
 *
 * Files live inside the repo under `.git/riff-ai-review/` (or `.jj/…` for
 * standalone jj). Keeping them inside cwd means claude already trusts the
 * path — no `--add-dir` prompt — and `.git` / `.jj` are VCS-internal so
 * nothing leaks into tracked state.
 *
 * Layout:
 *   <repo>/.git/riff-ai-review/
 *     system-prompt.md
 *     gh-{owner}-{repo}-{number}/
 *       full.md
 *       file-{slug}.md
 *       folder-{slug}.md
 *     local/
 *       full.md
 *       file-{slug}.md
 *       folder-{slug}.md
 */
function writeContextFile(input: WriteInput): string {
  const root = resolveContextRoot()
  const scope = scopeDirName(input.mode, input.prInfo, input.source)
  const dir = join(root, scope)
  mkdirSync(dir, { recursive: true })

  let basename: string
  if (input.kind === "full") {
    basename = "full.md"
  } else if (input.kind === "multi") {
    // Only ever one active hand-picked selection at a time — deterministic
    // name means re-invoking overwrites rather than accumulating.
    basename = "multi.md"
  } else if (input.kind === "folder") {
    basename = `folder-${slugify(input.filename ?? "unknown")}.md`
  } else {
    basename = `file-${slugify(input.filename ?? "unknown")}.md`
  }

  const full = join(dir, basename)
  writeFileSync(full, input.content, "utf8")
  return full
}

function scopeDirName(
  mode: "local" | "pr",
  prInfo: PrInfo | null,
  source: string,
): string {
  if (mode === "pr" && prInfo) {
    return `gh-${slugify(prInfo.owner)}-${slugify(prInfo.repo)}-${prInfo.number}`
  }
  // Local mode — key off the source string so distinct targets get distinct dirs.
  // Typical source values: "local", "branch:main", etc.
  const suffix = slugify(source || "local")
  return suffix === "local" ? "local" : `local-${suffix}`
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "x"
}

function scheduleToastClear(ctx: AiReviewContext, ms = 1500): void {
  setTimeout(() => {
    ctx.setState(clearToast)
    ctx.render()
  }, ms)
}
