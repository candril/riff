import { join, resolve } from "path"
import { mkdir, readdir, rename, unlink } from "fs/promises"
import { existsSync } from "fs"
import type { Comment } from "../types"
import { LOCAL_DIR, getStorageDir, sourceToDir } from "./resolve"
import { parseComment, parseFrontmatter, toMarkdown } from "./comments-md"

const COMMENTS_DIR = "comments"

/** Repos whose per-revset folders have already been folded in this process. */
const mergedLocalDirs = new Set<string>()

/**
 * Move the comments riff used to file per revset into the one local store.
 *
 * Older versions put them in `comments/@-`, `comments/abc123` and so on.
 * They are moved rather than read in place, so a note edited after the move
 * does not leave a stale twin behind in the folder it came from.
 */
async function mergeLegacyLocalComments(baseDir: string): Promise<void> {
  if (mergedLocalDirs.has(baseDir)) return
  mergedLocalDirs.add(baseDir)

  const root = join(baseDir, COMMENTS_DIR)
  const target = join(root, LOCAL_DIR)

  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === LOCAL_DIR || entry.name.startsWith("gh-")) continue

    try {
      const files = await readdir(join(root, entry.name))
      for (const file of files) {
        if (!file.endsWith(".md")) continue
        const to = join(target, file)
        if (existsSync(to)) continue
        await mkdir(target, { recursive: true })
        await rename(join(root, entry.name, file), to)
      }
    } catch {
      // A folder riff cannot read is a folder riff leaves alone.
    }
  }
}

async function ensureStorageDir(source: string): Promise<string> {
  const baseDir = await getStorageDir(source)
  const fullPath = join(baseDir, COMMENTS_DIR, sourceToDir(source))
  await mkdir(fullPath, { recursive: true })
  return baseDir
}

/** A GitHub id like "gh-12345678" names its file whole; a UUID by its first eight characters. */
function shortId(id: string): string {
  if (id.startsWith("gh-")) {
    return id
  }
  return id.slice(0, 8)
}

export async function loadComments(source: string): Promise<Comment[]> {
  const baseDir = await getStorageDir(source)
  if (sourceToDir(source) === LOCAL_DIR) await mergeLegacyLocalComments(baseDir)
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

    comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    return comments
  } catch {
    return []
  }
}

export async function saveComment(comment: Comment, source: string): Promise<void> {
  const baseDir = await ensureStorageDir(source)

  const filename = `${shortId(comment.id)}.md`
  const filepath = join(baseDir, COMMENTS_DIR, sourceToDir(source), filename)

  await Bun.write(filepath, toMarkdown(comment))
}

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
 * Absolute path of a comment's markdown file — handed to Claude so it can
 * delete a comment once it has acted on it (spec 049).
 */
export async function commentFilePath(commentId: string, source: string): Promise<string> {
  const baseDir = await getStorageDir(source)
  return resolve(join(baseDir, COMMENTS_DIR, sourceToDir(source), `${shortId(commentId)}.md`))
}

/**
 * Delete every local (never synced) comment file for a source, resolved or
 * not. Synced comments are GitHub's and stay. Returns how many were removed.
 */
export async function clearLocalComments(source: string): Promise<number> {
  const comments = await loadComments(source)
  const local = comments.filter((c) => c.status === "local")
  await Promise.all(local.map((c) => deleteCommentFile(c.id, source)))
  return local.length
}

export async function updateComment(comment: Comment, source: string): Promise<void> {
  await saveComment(comment, source)
}
