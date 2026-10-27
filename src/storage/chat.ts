import { dirname, join } from "path"
import { mkdirSync, writeFileSync } from "fs"
import { mkdir, rm } from "fs/promises"
import { localStorageDir, sourceToDir } from "./resolve"

const CHAT_FILE = "chat.json"

/**
 * Notes are left out: each describes a moment (a failure, a read that did
 * not work), and bringing them back on every launch would pile them up.
 * A question's position is kept only as the label the chat drew, folded
 * into its labels; the excerpt behind it went to the agent and is not
 * sent again.
 */
export type SavedEntry =
  | { kind: "question"; text: string; labels: string[] }
  | { kind: "answer"; text: string; interrupted: boolean }

export interface SavedChat {
  sessionId: string | null
  // The PR head the agent last heard about, so new commits reach it once.
  headSha: string | null
  entries: SavedEntry[]
}

function reviewDir(source: string): string {
  return join(localStorageDir(), sourceToDir(source))
}

/**
 * Comments anchor to a file and line, so every local review shares one store;
 * a conversation is about one diff, so each local target keeps its own. The
 * uncommitted changes and a PR keep the plain name their files already have.
 * A revset such as `main..@` is no safe file name, hence the hash.
 */
function chatPath(source: string): string {
  if (source === "local" || source.startsWith("gh:")) return join(reviewDir(source), CHAT_FILE)
  const id = new Bun.CryptoHasher("sha256").update(source).digest("hex").slice(0, 12)
  return join(reviewDir(source), `chat-${id}.json`)
}

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

function toEntry(value: unknown): SavedEntry | null {
  if (typeof value !== "object" || value === null) return null
  const entry = value as Record<string, unknown>
  if (typeof entry.text !== "string") return null
  if (entry.kind === "question" && isStrings(entry.labels)) {
    return { kind: "question", text: entry.text, labels: entry.labels }
  }
  if (entry.kind === "answer" && typeof entry.interrupted === "boolean") {
    return { kind: "answer", text: entry.text, interrupted: entry.interrupted }
  }
  return null
}

const stringOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null)

/**
 * The review's earlier conversation, or null when there is none riff can
 * trust. Never throws: a chat file that cannot be read costs the history,
 * not the review. An entry riff does not recognise is dropped on its own.
 */
export async function loadChat(source: string): Promise<SavedChat | null> {
  try {
    const file = Bun.file(chatPath(source))
    if (!(await file.exists())) return null
    const data: unknown = await file.json()
    if (typeof data !== "object" || data === null) return null
    const chat = data as Record<string, unknown>
    if (!Array.isArray(chat.entries)) return null
    return {
      sessionId: stringOrNull(chat.sessionId),
      headSha: stringOrNull(chat.headSha),
      entries: chat.entries.map(toEntry).filter((entry): entry is SavedEntry => entry !== null),
    }
  } catch {
    return null
  }
}

/** The last write queued per file, so an answer saved right after its question lands second. */
const writes = new Map<string, Promise<void>>()

function queue(path: string, write: () => Promise<void>): Promise<void> {
  const queued = (writes.get(path) ?? Promise.resolve()).catch(() => {}).then(write)
  writes.set(path, queued)
  void queued.finally(() => {
    if (writes.get(path) === queued) writes.delete(path)
  }).catch(() => {})
  return queued
}

// The sync write is the final word on the way out: nothing queued before or asked after it may touch the file.
const sealed = new Set<string>()

export function saveChat(source: string, chat: SavedChat): Promise<void> {
  const path = chatPath(source)
  return queue(path, async () => {
    await mkdir(dirname(path), { recursive: true })
    if (sealed.has(path)) return
    await Bun.write(path, JSON.stringify(chat, null, 2))
  })
}

export function saveChatSync(source: string, chat: SavedChat): void {
  const path = chatPath(source)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(chat, null, 2))
  } catch {
    // A conversation that cannot be written is not worth failing the exit over.
  }
  sealed.add(path)
}

export function clearChat(source: string): Promise<void> {
  const path = chatPath(source)
  return queue(path, async () => {
    if (!sealed.has(path)) await rm(path, { force: true })
  })
}
