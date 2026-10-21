import { join } from "path"
import { mkdir, unlink } from "fs/promises"
import { type ReviewSession, createSession } from "../types"
import { localStorageDir } from "./resolve"

// Sessions are always stored locally in .riff/, never in the global store,
// whatever storage the review's comments resolved to.
const SESSION_FILE = "session.json"

/** The checkout's session, or null when it belongs to another source. */
async function loadSession(source: string): Promise<ReviewSession | null> {
  const filepath = join(localStorageDir(), SESSION_FILE)
  const file = Bun.file(filepath)

  if (!(await file.exists())) {
    return null
  }

  try {
    const session = await file.json()
    if (session.source === source) {
      return session
    }
    return null
  } catch {
    return null
  }
}

export async function saveSession(session: ReviewSession): Promise<void> {
  await mkdir(localStorageDir(), { recursive: true })

  const filepath = join(localStorageDir(), SESSION_FILE)
  session.updatedAt = new Date().toISOString()

  await Bun.write(filepath, JSON.stringify(session, null, 2))
}

export async function loadOrCreateSession(source: string): Promise<ReviewSession> {
  const existing = await loadSession(source)
  if (existing) {
    return existing
  }

  const session = createSession(source)
  await saveSession(session)
  return session
}

export async function deleteSession(): Promise<void> {
  const filepath = join(localStorageDir(), SESSION_FILE)

  try {
    await unlink(filepath)
  } catch {
    // File may not exist
  }
}
