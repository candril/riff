import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGotoCli } from "../../cli/goto"
import { answerLink, type LinkFragment } from "."
import { listenForLinks, sendLink, socketPath, type LinkServer } from "./socket"

const SOURCE = "gh:owner/repo#5"
const PR = "https://github.com/owner/repo/pull/5"

let dir: string
let servers: LinkServer[]

beforeEach(() => {
  // Short, and owner-only as mkdtemp makes it: a socket path has 103 bytes.
  dir = mkdtempSync(join(tmpdir(), "riff-sock-"))
  servers = []
})

afterEach(() => {
  for (const server of servers) server.close()
  rmSync(dir, { recursive: true, force: true })
})

/** The review of `source` listening in the test's directory, recording what it is handed. */
async function listen(source = SOURCE) {
  const followed: (LinkFragment | null)[] = []
  const server = await listenForLinks(socketPath(source, dir), (url) => answerLink(url, source, (f) => followed.push(f)))
  if (server) servers.push(server)
  return { server, followed }
}

/** `riff goto`, with its socket in the test's directory and its stderr kept. */
async function goto(...args: string[]) {
  const errors: string[] = []
  const code = await runGotoCli(args, {
    send: (path, url) => sendLink(path, url, 1000),
    socketFor: (source) => socketPath(source, dir),
    error: (line) => errors.push(line),
  })
  return { code, errors }
}

describe("socketPath", () => {
  test("is the review's storage slug, lowercased", () => {
    expect(socketPath("gh:Owner/Repo#5", "/run")).toBe("/run/gh-owner-repo-5.sock")
  })

  test("a name too long for a socket is hashed, the same way each time", () => {
    const long = `gh:owner/${"r".repeat(120)}#5`
    const path = socketPath(long, "/run")
    expect(path).toMatch(/^\/run\/gh-[0-9a-f]{24}\.sock$/)
    expect(socketPath(long, "/run")).toBe(path)
  })
})

describe("the goto round trip", () => {
  test("a link reaches the listening review as its parsed fragment", async () => {
    const { followed } = await listen()
    expect(await goto(`${PR}#discussion_r42`)).toEqual({ code: 0, errors: [] })
    expect(followed).toEqual([{ kind: "target", target: { kind: "review-comment", githubId: 42 } }])
  })

  test("the socket is the user's alone", async () => {
    const { server } = await listen()
    expect(statSync(server!.path).mode & 0o777).toBe(0o600)
  })

  test("a raw link with a tab's path finds the same review", async () => {
    const { followed } = await listen()
    expect((await goto(`${PR}/files#issuecomment-7`)).code).toBe(0)
    expect(followed).toEqual([{ kind: "target", target: { kind: "issue-comment", githubId: 7 } }])
  })

  test("a fragment riff cannot follow still lands, for the review to say so", async () => {
    const { followed } = await listen()
    expect((await goto(`${PR}#top`)).code).toBe(0)
    expect(followed).toEqual([{ kind: "unknown", fragment: "top" }])
  })

  test("no running riff for the PR exits 1 and says so", async () => {
    expect(await goto(`${PR}#r1`)).toEqual({ code: 1, errors: ["riff goto: no running riff has gh:owner/repo#5 open"] })
  })

  test("a review of another PR refuses the link", async () => {
    // Listening at #5's socket while showing #6: what goto meets if the names ever disagree.
    const followed: (LinkFragment | null)[] = []
    const server = await listenForLinks(socketPath(SOURCE, dir), (url) => answerLink(url, "gh:owner/repo#6", (f) => followed.push(f)))
    servers.push(server!)
    const { code, errors } = await goto(`${PR}#r1`)
    expect(code).toBe(2)
    expect(errors[0]).toContain("showing gh:owner/repo#6")
    expect(followed).toEqual([])
  })

  test("anything but a PR link is a usage error, and nothing is sent", async () => {
    expect((await goto("https://github.com/owner/repo/issues/5")).code).toBe(1)
    expect((await goto()).code).toBe(1)
    expect((await goto(PR, "extra")).code).toBe(1)
  })
})

describe("the listening review", () => {
  test("a socket left by a riff that died is replaced", async () => {
    writeFileSync(socketPath(SOURCE, dir), "")
    const { server, followed } = await listen()
    expect(server).not.toBeNull()
    expect((await goto(`${PR}#r1`)).code).toBe(0)
    expect(followed).toHaveLength(1)
  })

  test("a second riff on the same PR leaves the first one listening", async () => {
    const first = await listen()
    const second = await listen()
    expect(second.server).toBeNull()
    expect((await goto(`${PR}#r1`)).code).toBe(0)
    expect(first.followed).toHaveLength(1)
  })

  test("closing removes the socket", async () => {
    const { server } = await listen()
    server!.close()
    expect(existsSync(server!.path)).toBe(false)
  })

  test("a directory others can write to is not listened in", async () => {
    chmodSync(dir, 0o777)
    const { server } = await listen()
    expect(server).toBeNull()
  })

  test.each([
    ["not JSON", "error: not JSON"],
    [JSON.stringify({ link: PR }), 'error: expected {"url": "..."}'],
    [JSON.stringify({ url: "https://example.com" }), "error: not a GitHub pull request link"],
  ])("%p is refused", async (request, reply) => {
    const { server, followed } = await listen()
    expect(await rawRequest(server!.path, `${request}\n`)).toBe(`${reply}\n`)
    expect(followed).toEqual([])
  })
})

/** One request written as it stands, and the reply read back whole. */
function rawRequest(path: string, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let received = ""
    Bun.connect({
      unix: path,
      socket: {
        open: (socket) => void socket.write(request),
        data: (_socket, chunk) => void (received += chunk.toString()),
        close: () => resolve(received),
        error: (_socket, error) => reject(error),
      },
    }).catch(reject)
  })
}
