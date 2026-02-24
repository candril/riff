import { join } from "path"
import { mkdir, readdir, unlink } from "fs/promises"
import { type Comment, type ReviewSession, createSession } from "./types"

const STORAGE_DIR = ".neoriff"
const COMMENTS_DIR = "comments"
const SESSION_FILE = "session.json"

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
 */
function toMarkdown(comment: Comment): string {
  const lines = [
    "---",
    `id: ${comment.id}`,
    `filename: ${comment.filename}`,
    `line: ${comment.line}`,
    `side: ${comment.side}`,
    `createdAt: ${comment.createdAt}`,
    `status: ${comment.status}`,
  ]

  if (comment.commit) lines.push(`commit: ${comment.commit}`)
  if (comment.githubId) lines.push(`githubId: ${comment.githubId}`)
  if (comment.githubUrl) lines.push(`githubUrl: ${comment.githubUrl}`)
  if (comment.author) lines.push(`author: ${comment.author}`)
  if (comment.inReplyTo) lines.push(`inReplyTo: ${comment.inReplyTo}`)

  lines.push("---", "", comment.body)

  return lines.join("\n")
}

/**
 * Parse a Comment from frontmatter metadata and body
 */
function parseComment(meta: Record<string, string>, body: string): Comment {
  return {
    id: meta.id || "",
    filename: meta.filename || "",
    line: parseInt(meta.line || "0", 10),
    side: (meta.side as "LEFT" | "RIGHT") || "RIGHT",
    body,
    createdAt: meta.createdAt || new Date().toISOString(),
    status: (meta.status as "local" | "pending" | "synced") || "local",
    commit: meta.commit || undefined,
    githubId: meta.githubId ? parseInt(meta.githubId, 10) : undefined,
    githubUrl: meta.githubUrl || undefined,
    author: meta.author || undefined,
    inReplyTo: meta.inReplyTo || undefined,
  }
}

// ============================================================================
// Directory helpers
// ============================================================================

/**
 * Ensure storage directories exist
 */
async function ensureStorageDir(): Promise<void> {
  await mkdir(join(STORAGE_DIR, COMMENTS_DIR), { recursive: true })
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
 * Load all comments from markdown files
 */
export async function loadComments(): Promise<Comment[]> {
  const commentsPath = join(STORAGE_DIR, COMMENTS_DIR)

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
 * Save a comment to a markdown file
 */
export async function saveComment(comment: Comment): Promise<void> {
  await ensureStorageDir()

  const filename = `${shortId(comment.id)}.md`
  const filepath = join(STORAGE_DIR, COMMENTS_DIR, filename)

  await Bun.write(filepath, toMarkdown(comment))
}

/**
 * Delete a comment file
 */
export async function deleteCommentFile(commentId: string): Promise<void> {
  const filename = `${shortId(commentId)}.md`
  const filepath = join(STORAGE_DIR, COMMENTS_DIR, filename)

  try {
    await unlink(filepath)
  } catch {
    // File may not exist
  }
}

/**
 * Update a comment (save with same ID)
 */
export async function updateComment(comment: Comment): Promise<void> {
  await saveComment(comment)
}

// ============================================================================
// Session storage - JSON file (metadata only)
// ============================================================================

/**
 * Load session metadata
 */
export async function loadSession(source: string): Promise<ReviewSession | null> {
  const filepath = join(STORAGE_DIR, SESSION_FILE)
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
  await ensureStorageDir()

  const filepath = join(STORAGE_DIR, SESSION_FILE)
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
  const filepath = join(STORAGE_DIR, SESSION_FILE)

  try {
    await unlink(filepath)
  } catch {
    // File may not exist
  }
}
