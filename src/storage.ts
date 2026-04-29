import { join, dirname } from "path"
import { homedir } from "os"
import { mkdir, readdir, unlink } from "fs/promises"
import { type Comment, type ReviewSession, type FileReviewStatus, createSession } from "./types"
import { loadConfig } from "./config"

const LOCAL_STORAGE_DIR = ".riff"
const GLOBAL_STORAGE_DIR = join(homedir(), ".riff")
const COMMENTS_DIR = "comments"
const SESSION_FILE = "session.json"
const VIEWED_FILE = "viewed.json"

// Cached resolved storage directory per source
const resolvedStorageDirs = new Map<string, string>()

// Current repo info (cached)
let currentRepoOwner: string | null = null
let currentRepoName: string | null = null
let currentRepoChecked = false

// ============================================================================
// Path utilities
// ============================================================================

/**
 * Expand ~ to home directory
 */
function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2))
  }
  return p
}

/**
 * Find the repository root by looking for .git or .jj directory
 */
async function findRepoRoot(startPath: string = process.cwd()): Promise<string | null> {
  let current = startPath

  while (current !== "/") {
    const gitPath = join(current, ".git")
    const jjPath = join(current, ".jj")

    const gitFile = Bun.file(gitPath)
    const jjFile = Bun.file(jjPath)

    if ((await gitFile.exists()) || (await jjFile.exists())) {
      return current
    }

    current = dirname(current)
  }

  return null
}

/**
 * Check if path is a valid git/jj repo
 */
async function isValidRepo(path: string): Promise<boolean> {
  try {
    const gitPath = join(path, ".git")
    const jjPath = join(path, ".jj")
    const gitFile = Bun.file(gitPath)
    const jjFile = Bun.file(jjPath)
    return (await gitFile.exists()) || (await jjFile.exists())
  } catch {
    return false
  }
}

/**
 * Get git remote URL for a repo path
 */
async function getGitRemoteUrl(path: string): Promise<string | null> {
  try {
    const result = await Bun.$`git -C ${path} remote get-url origin`.quiet().text()
    return result.trim()
  } catch {
    return null
  }
}

// ============================================================================
// Repo detection
// ============================================================================

/**
 * Get current repo's GitHub remote info (owner/repo).
 * Returns null if not a git repo or no GitHub remote.
 */
async function getCurrentRepoInfo(): Promise<{ owner: string; repo: string } | null> {
  if (currentRepoChecked) {
    return currentRepoOwner && currentRepoName
      ? { owner: currentRepoOwner, repo: currentRepoName }
      : null
  }

  currentRepoChecked = true

  try {
    const result = (await Bun.$`gh repo view --json owner,name`.quiet().json()) as {
      owner: { login: string }
      name: string
    }
    currentRepoOwner = result.owner.login
    currentRepoName = result.name
    return { owner: currentRepoOwner, repo: currentRepoName }
  } catch {
    return null
  }
}

/**
 * Check if a PR source belongs to the current repo.
 */
async function isCurrentRepo(source: string): Promise<boolean> {
  // Local sources always belong to current repo
  if (!source.startsWith("gh:")) {
    return true
  }

  // Parse source: "gh:owner/repo#123"
  const match = source.match(/^gh:([^/]+)\/([^#]+)#/)
  if (!match) {
    return true // Can't parse, assume local
  }

  const [, sourceOwner, sourceRepo] = match
  const currentRepo = await getCurrentRepoInfo()

  if (!currentRepo) {
    return false // Not in a git repo, use global storage
  }

  return (
    currentRepo.owner.toLowerCase() === sourceOwner!.toLowerCase() &&
    currentRepo.repo.toLowerCase() === sourceRepo!.toLowerCase()
  )
}

/**
 * Find local repo path for a GitHub PR using explicit config mapping
 */
async function findLocalRepoFromConfig(owner: string, repo: string): Promise<string | null> {
  const config = loadConfig()

  // Check explicit mapping: "owner/repo" -> local path
  const key = `${owner}/${repo}`
  const mappedPath = config.storage.repos[key]

  if (mappedPath) {
    const expanded = expandPath(mappedPath)
    if (await isValidRepo(expanded)) {
      return expanded
    }
  }

  return null
}

/**
 * Auto-detect repo in basePath by repo name.
 * Returns the path if found, null otherwise.
 */
async function autoDetectRepoInBasePath(repo: string, basePath: string): Promise<string | null> {
  const expanded = expandPath(basePath)
  const candidatePath = join(expanded, repo)

  if (await isValidRepo(candidatePath)) {
    // Verify it's the right repo by checking git remote contains the repo name
    const remote = await getGitRemoteUrl(candidatePath)
    if (remote?.includes(repo)) {
      return candidatePath
    }
  }

  return null
}

// ============================================================================
// Storage resolution
// ============================================================================

export interface RepoResolution {
  /** The resolved storage directory path */
  path: string
  /** How the path was resolved */
  source: "config" | "configMapping" | "basePath" | "cwd" | "repoRoot" | "global"
  /** Whether user confirmation is needed before using this path */
  needsConfirmation: boolean
  /** The full repo path (without .riff suffix) for display purposes */
  repoPath?: string
}

/**
 * Parse owner and repo from a source string
 */
function parseSource(source: string): { owner: string; repo: string } | null {
  const match = source.match(/^gh:([^/]+)\/([^#]+)#/)
  if (match) {
    return { owner: match[1]!, repo: match[2]! }
  }
  return null
}

/**
 * Resolve storage directory for a source.
 *
 * Resolution order:
 * 1. Config storage.path override
 * 2. Config storage.repos explicit mapping (for GitHub PRs)
 * 3. Current directory if it matches the PR's repo
 * 4. Config storage.basePath auto-detection (needs confirmation)
 * 5. Repo root (find .git/.jj)
 * 6. Global ~/.riff/ as fallback
 */
export async function resolveStorageDir(source: string): Promise<RepoResolution> {
  const config = loadConfig()

  // 1. Explicit config path override
  if (config.storage.path) {
    return {
      path: expandPath(config.storage.path),
      source: "config",
      needsConfirmation: false,
    }
  }

  // For GitHub PRs, try various resolution strategies
  const parsed = parseSource(source)
  if (parsed) {
    const { owner, repo } = parsed

    // 2. Explicit mapping in config
    const mappedRepo = await findLocalRepoFromConfig(owner, repo)
    if (mappedRepo) {
      return {
        path: join(mappedRepo, LOCAL_STORAGE_DIR),
        source: "configMapping",
        needsConfirmation: false,
        repoPath: mappedRepo,
      }
    }

    // 3. Check if cwd matches
    const isLocal = await isCurrentRepo(source)
    if (isLocal) {
      return {
        path: LOCAL_STORAGE_DIR,
        source: "cwd",
        needsConfirmation: false,
      }
    }

    // 4. Try basePath auto-detection (needs confirmation)
    if (config.storage.basePath) {
      const autoDetected = await autoDetectRepoInBasePath(repo, config.storage.basePath)
      if (autoDetected) {
        return {
          path: join(autoDetected, LOCAL_STORAGE_DIR),
          source: "basePath",
          needsConfirmation: true, // User should confirm
          repoPath: autoDetected,
        }
      }
    }
  }

  // 5. Check if cwd matches (for non-PR sources like "local")
  const isLocal = await isCurrentRepo(source)
  if (isLocal) {
    return {
      path: LOCAL_STORAGE_DIR,
      source: "cwd",
      needsConfirmation: false,
    }
  }

  // 6. Try to find repo root
  const repoRoot = await findRepoRoot()
  if (repoRoot) {
    return {
      path: join(repoRoot, LOCAL_STORAGE_DIR),
      source: "repoRoot",
      needsConfirmation: false,
      repoPath: repoRoot,
    }
  }

  // 7. Global fallback
  return {
    path: GLOBAL_STORAGE_DIR,
    source: "global",
    needsConfirmation: false,
  }
}

/**
 * Resolve storage with user confirmation for auto-detected paths.
 * Called during app initialization.
 *
 * @param source - The source identifier (e.g., "gh:owner/repo#123")
 * @param confirm - Callback to confirm with user. Returns true to use path, false for global.
 */
export async function resolveStorageWithConfirmation(
  source: string,
  confirm: (repoPath: string, ownerRepo: string) => Promise<boolean>
): Promise<string> {
  const resolution = await resolveStorageDir(source)

  if (resolution.needsConfirmation && resolution.repoPath) {
    const parsed = parseSource(source)
    const ownerRepo = parsed ? `${parsed.owner}/${parsed.repo}` : source

    const confirmed = await confirm(resolution.repoPath, ownerRepo)

    if (confirmed) {
      // Cache the confirmed path
      resolvedStorageDirs.set(source, resolution.path)
      return resolution.path
    } else {
      // Fall back to global storage
      resolvedStorageDirs.set(source, GLOBAL_STORAGE_DIR)
      return GLOBAL_STORAGE_DIR
    }
  }

  // Cache and return the resolved path
  resolvedStorageDirs.set(source, resolution.path)
  return resolution.path
}

/**
 * Get the base storage directory for a source.
 * Uses cached resolution if available, otherwise resolves without confirmation.
 */
async function getStorageDir(source: string): Promise<string> {
  // Check cache first
  const cached = resolvedStorageDirs.get(source)
  if (cached) {
    return cached
  }

  // Resolve without confirmation (for backwards compatibility)
  const resolution = await resolveStorageDir(source)

  // For auto-detected paths without confirmation, fall back to global
  if (resolution.needsConfirmation) {
    return GLOBAL_STORAGE_DIR
  }

  return resolution.path
}

/**
 * Convert a source identifier to a safe directory name.
 * e.g., "gh:owner/repo#123" -> "gh-owner-repo-123"
 *       "local" -> "local"
 */
function sourceToDir(source: string): string {
  return source
    .replace(/:/g, "-")
    .replace(/\//g, "-")
    .replace(/#/g, "-")
}

// ============================================================================
// Frontmatter parsing/generation
// ============================================================================

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return { meta: {}, body: content }
  }

  const frontmatter = match[1] ?? ""
  const bodyContent = match[2] ?? ""

  const meta: Record<string, string> = {}
  for (const line of frontmatter.split("\n")) {
    const colonIndex = line.indexOf(": ")
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 2).trim()
      if (key && value) {
        meta[key] = value
      }
    }
  }

  return { meta, body: bodyContent.trim() }
}

/**
 * Generate markdown with YAML frontmatter for a comment
 * Format:
 *   ---
 *   frontmatter...
 *   ---
 *   
 *   comment body
 *   
 *   <!-- context -->
 *   ```diff
 *   diff hunk...
 *   ```
 */
function toMarkdown(comment: Comment): string {
  const lines = [
    "---",
    `id: ${comment.id}`,
    `filename: ${comment.filename}`,
    `line: ${comment.line ?? 0}`,
    `side: ${comment.side}`,
    `createdAt: ${comment.createdAt}`,
    `status: ${comment.status}`,
  ]

  if (comment.commit) lines.push(`commit: ${comment.commit}`)
  if (comment.githubId) lines.push(`githubId: ${comment.githubId}`)
  if (comment.githubUrl) lines.push(`githubUrl: ${comment.githubUrl}`)
  if (comment.githubThreadId) lines.push(`githubThreadId: ${comment.githubThreadId}`)
  if (comment.isThreadResolved !== undefined) lines.push(`isThreadResolved: ${comment.isThreadResolved}`)
  if (comment.outdated !== undefined) lines.push(`outdated: ${comment.outdated}`)
  if (comment.author) lines.push(`author: ${comment.author}`)
  if (comment.inReplyTo) lines.push(`inReplyTo: ${comment.inReplyTo}`)

  lines.push("---", "", comment.body)
  
  // Add diff context if available (as HTML comment + code block)
  if (comment.diffHunk) {
    lines.push("", "<!-- context -->", "```diff", comment.diffHunk, "```")
  }

  return lines.join("\n")
}

/**
 * Parse a Comment from frontmatter metadata and body
 */
function parseComment(meta: Record<string, string>, body: string): Comment {
  // Extract diffHunk from body if present (marked with <!-- context -->)
  let commentBody = body
  let diffHunk: string | undefined
  
  const contextMarker = "<!-- context -->"
  const contextIndex = body.indexOf(contextMarker)
  if (contextIndex !== -1) {
    commentBody = body.slice(0, contextIndex).trim()
    const contextSection = body.slice(contextIndex + contextMarker.length)
    // Extract content between ```diff and ```
    const diffMatch = contextSection.match(/```diff\n([\s\S]*?)\n```/)
    if (diffMatch) {
      diffHunk = diffMatch[1]
    }
  }
  
  return {
    id: meta.id || "",
    filename: meta.filename || "",
    line: parseInt(meta.line || "0", 10),
    side: (meta.side as "LEFT" | "RIGHT") || "RIGHT",
    body: commentBody,
    createdAt: meta.createdAt || new Date().toISOString(),
    status: (meta.status as "local" | "pending" | "synced") || "local",
    commit: meta.commit || undefined,
    diffHunk,
    githubId: meta.githubId ? parseInt(meta.githubId, 10) : undefined,
    githubUrl: meta.githubUrl || undefined,
    githubThreadId: meta.githubThreadId || undefined,
    isThreadResolved: meta.isThreadResolved === "true" ? true : meta.isThreadResolved === "false" ? false : undefined,
    outdated: meta.outdated === "true" ? true : meta.outdated === "false" ? false : undefined,
    author: meta.author || undefined,
    inReplyTo: meta.inReplyTo || undefined,
  }
}

// ============================================================================
// Directory helpers
// ============================================================================

/**
 * Ensure storage directories exist for a given source
 */
async function ensureStorageDir(source: string): Promise<string> {
  const baseDir = await getStorageDir(source)
  const fullPath = join(baseDir, COMMENTS_DIR, sourceToDir(source))
  await mkdir(fullPath, { recursive: true })
  return baseDir
}

/**
 * Get short ID for filename (first 8 chars of UUID)
 */
function shortId(id: string): string {
  // For GitHub comments like "gh-12345678", use as-is
  if (id.startsWith("gh-")) {
    return id
  }
  // For UUIDs, take first 8 chars
  return id.slice(0, 8)
}

// ============================================================================
// Comment storage - markdown files
// ============================================================================

/**
 * Load all comments from markdown files for a specific source
 */
export async function loadComments(source: string): Promise<Comment[]> {
  const baseDir = await getStorageDir(source)
  const commentsPath = join(baseDir, COMMENTS_DIR, sourceToDir(source))

  try {
    const files = await readdir(commentsPath)
    const comments: Comment[] = []

    for (const file of files) {
      if (!file.endsWith(".md")) continue

      try {
        const content = await Bun.file(join(commentsPath, file)).text()
        const { meta, body } = parseFrontmatter(content)

        if (meta.id) {
          comments.push(parseComment(meta, body))
        }
      } catch {
        // Skip invalid files
      }
    }

    // Sort by createdAt
    comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    return comments
  } catch {
    return []
  }
}

/**
 * Save a comment to a markdown file for a specific source
 */
export async function saveComment(comment: Comment, source: string): Promise<void> {
  const baseDir = await ensureStorageDir(source)

  const filename = `${shortId(comment.id)}.md`
  const filepath = join(baseDir, COMMENTS_DIR, sourceToDir(source), filename)

  await Bun.write(filepath, toMarkdown(comment))
}

/**
 * Delete a comment file for a specific source
 */
export async function deleteCommentFile(commentId: string, source: string): Promise<void> {
  const baseDir = await getStorageDir(source)
  const filename = `${shortId(commentId)}.md`
  const filepath = join(baseDir, COMMENTS_DIR, sourceToDir(source), filename)

  try {
    await unlink(filepath)
  } catch {
    // File may not exist
  }
}

/**
 * Update a comment (save with same ID) for a specific source
 */
export async function updateComment(comment: Comment, source: string): Promise<void> {
  await saveComment(comment, source)
}

// ============================================================================
// Session storage - JSON file (metadata only)
// Sessions are always stored locally in .riff/ (not global)
// ============================================================================

/**
 * Load session metadata
 */
export async function loadSession(source: string): Promise<ReviewSession | null> {
  const filepath = join(LOCAL_STORAGE_DIR, SESSION_FILE)
  const file = Bun.file(filepath)

  if (!(await file.exists())) {
    return null
  }

  try {
    const session = await file.json()
    // Only return if source matches
    if (session.source === source) {
      return session
    }
    return null
  } catch {
    return null
  }
}

/**
 * Save session metadata
 */
export async function saveSession(session: ReviewSession): Promise<void> {
  await mkdir(LOCAL_STORAGE_DIR, { recursive: true })

  const filepath = join(LOCAL_STORAGE_DIR, SESSION_FILE)
  session.updatedAt = new Date().toISOString()

  await Bun.write(filepath, JSON.stringify(session, null, 2))
}

/**
 * Load or create a session for a source
 */
export async function loadOrCreateSession(source: string): Promise<ReviewSession> {
  const existing = await loadSession(source)
  if (existing) {
    return existing
  }

  const session = createSession(source)
  await saveSession(session)
  return session
}

/**
 * Delete session file
 */
export async function deleteSession(): Promise<void> {
  const filepath = join(LOCAL_STORAGE_DIR, SESSION_FILE)

  try {
    await unlink(filepath)
  } catch {
    // File may not exist
  }
}

// ============================================================================
// Viewed file status storage - JSON file per source
// ============================================================================

/**
 * Get the path for viewed status file
 */
function getViewedFilePath(source: string): string {
  return join(LOCAL_STORAGE_DIR, sourceToDir(source), VIEWED_FILE)
}

/**
 * Load viewed file statuses for a source
 */
export async function loadViewedStatuses(source: string): Promise<FileReviewStatus[]> {
  const filepath = getViewedFilePath(source)
  const file = Bun.file(filepath)

  if (!(await file.exists())) {
    return []
  }

  try {
    const data = await file.json() as FileReviewStatus[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/**
 * Save viewed file statuses for a source
 */
export async function saveViewedStatuses(
  source: string, 
  statuses: Map<string, FileReviewStatus>
): Promise<void> {
  const dirPath = join(LOCAL_STORAGE_DIR, sourceToDir(source))
  await mkdir(dirPath, { recursive: true })

  const filepath = getViewedFilePath(source)
  const data = Array.from(statuses.values())

  await Bun.write(filepath, JSON.stringify(data, null, 2))
}

/**
 * Save a single file's viewed status
 */
export async function saveFileViewedStatus(
  source: string,
  status: FileReviewStatus
): Promise<void> {
  // Load existing, update, and save
  const existing = await loadViewedStatuses(source)
  const statuses = new Map<string, FileReviewStatus>()
  
  for (const s of existing) {
    statuses.set(s.filename, s)
  }
  statuses.set(status.filename, status)
  
  await saveViewedStatuses(source, statuses)
}
