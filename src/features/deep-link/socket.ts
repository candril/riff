/**
 * The socket a PR review listens on, so a second link to the same PR reaches
 * the riff already showing it (spec 115): `riff goto <url>` writes one line
 * of JSON, `{"url": "..."}`, and reads one line back — `ok`, or `error: …`.
 */

import { createHash } from "node:crypto"
import { chmodSync, lstatSync, mkdirSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Socket } from "bun"
import { sourceToDir } from "../../storage/resolve"

// sun_path is 104 bytes on macOS, the NUL included.
const MAX_SOCKET_PATH = 103
// A request is a URL, which is short; anything longer is not one.
const MAX_REQUEST_BYTES = 8192

export function socketDir(): string {
  return join(tmpdir(), `riff-${process.getuid?.() ?? "user"}`)
}

/**
 * Where the review of `source` listens. Lowercase, since GitHub reads owner
 * and repository without regard to case and a link may spell them either way.
 * A name too long for a socket is hashed instead, which both ends agree on.
 */
export function socketPath(source: string, dir = socketDir()): string {
  const slug = sourceToDir(source).toLowerCase()
  const path = join(dir, `${slug}.sock`)
  if (Buffer.byteLength(path) <= MAX_SOCKET_PATH) return path
  return join(dir, `gh-${createHash("sha256").update(slug).digest("hex").slice(0, 24)}.sock`)
}

export interface LinkServer {
  path: string
  close: () => void
}

/**
 * Listen at `path`. `onRequest` gets the request's URL and answers with the
 * line to reply, or throws to refuse it. Null when another riff is already
 * listening there, or the directory is not one only this user can enter.
 */
export async function listenForLinks(path: string, onRequest: (url: string) => string): Promise<LinkServer | null> {
  const dir = join(path, "..")
  if (!ownPrivateDir(dir)) return null
  if (await answers(path)) return null
  removeFile(path)

  const buffers = new WeakMap<Socket<undefined>, string>()
  const listener = Bun.listen<undefined>({
    unix: path,
    socket: {
      data(socket, chunk) {
        const received = (buffers.get(socket) ?? "") + chunk.toString()
        const newline = received.indexOf("\n")
        if (newline === -1) {
          if (received.length > MAX_REQUEST_BYTES) reply(socket, "error: request too long")
          else buffers.set(socket, received)
          return
        }
        reply(socket, answer(received.slice(0, newline), onRequest))
      },
      error() {},
    },
  })
  chmodSync(path, 0o600)

  let closed = false
  return {
    path,
    close() {
      if (closed) return
      closed = true
      listener.stop(true)
      removeFile(path)
    },
  }
}

function answer(line: string, onRequest: (url: string) => string): string {
  try {
    const request: unknown = JSON.parse(line)
    const url = typeof request === "object" && request !== null ? (request as { url?: unknown }).url : undefined
    if (typeof url !== "string") return "error: expected {\"url\": \"...\"}"
    return onRequest(url)
  } catch (error) {
    return `error: ${error instanceof SyntaxError ? "not JSON" : error instanceof Error ? error.message : String(error)}`
  }
}

function reply(socket: Socket<undefined>, line: string): void {
  socket.end(`${line.replace(/[\r\n]+/g, " ")}\n`)
}

/**
 * Create the directory owner-only, or accept one that already is. A
 * directory someone else owns, or can write to, could hand a link to their
 * process instead.
 */
function ownPrivateDir(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const stat = lstatSync(dir)
    const uid = process.getuid?.()
    return stat.isDirectory() && (uid === undefined || stat.uid === uid) && (stat.mode & 0o077) === 0
  } catch {
    return false
  }
}

function removeFile(path: string): void {
  try {
    unlinkSync(path)
  } catch {}
}

/** Whether something is listening at `path`: a socket file left by a riff that died answers nothing. */
async function answers(path: string): Promise<boolean> {
  try {
    const socket = await Bun.connect({ unix: path, socket: { data() {}, error() {} } })
    socket.end()
    return true
  } catch {
    return false
  }
}

export type SendOutcome = { kind: "ok" } | { kind: "no-instance" } | { kind: "refused"; message: string }

/** Hand `url` to the riff listening at `path`, giving up after `timeoutMs`. */
export function sendLink(path: string, url: string, timeoutMs = 1000): Promise<SendOutcome> {
  return new Promise((resolve) => {
    let received = ""
    let settled = false
    const settle = (outcome: SendOutcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(outcome)
    }
    const timer = setTimeout(() => settle({ kind: "no-instance" }), timeoutMs)

    Bun.connect({
      unix: path,
      socket: {
        open(socket) {
          socket.write(`${JSON.stringify({ url })}\n`)
        },
        data(_socket, chunk) {
          received += chunk.toString()
        },
        close() {
          const line = received.split("\n")[0]!.trim()
          if (line === "ok") settle({ kind: "ok" })
          else if (line === "") settle({ kind: "no-instance" })
          else settle({ kind: "refused", message: line.replace(/^error:\s*/, "") })
        },
        error() {
          settle({ kind: "no-instance" })
        },
      },
    }).catch(() => settle({ kind: "no-instance" }))
  })
}
