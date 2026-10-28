import { test, expect, describe, afterAll, spyOn } from "bun:test"
import { mkdtemp, mkdir, readdir, writeFile, rm } from "fs/promises"
import { existsSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { clearChat, loadChat, saveChat, saveChatSync, type SavedChat } from "./chat"

const roots: string[] = []

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

async function inRepo<T>(run: (root: string) => Promise<T>): Promise<T> {
  const cwd = process.cwd()
  const root = await mkdtemp(join(tmpdir(), "riff-chat-"))
  roots.push(root)
  await mkdir(join(root, ".git"), { recursive: true })
  process.chdir(root)
  try {
    return await run(root)
  } finally {
    process.chdir(cwd)
  }
}

const filePath = (root: string) => join(root, ".riff", "local", "chat.json")

async function writeChatFile(root: string, text: string): Promise<void> {
  await mkdir(join(root, ".riff", "local"), { recursive: true })
  await writeFile(filePath(root), text)
}

const saved: SavedChat = {
  sessionId: "session-1",
  headSha: "abc1234",
  entries: [
    { kind: "question", text: "why?", labels: ["src/a.ts:3", "@file src/b.ts"] },
    { kind: "answer", text: "because", interrupted: false },
  ],
}

describe("the chat file", () => {
  test("gives back the conversation saved for the review, and nothing for another", async () => {
    await inRepo(async () => {
      await saveChat("local", saved)
      expect(await loadChat("local")).toEqual(saved)
      expect(await loadChat("gh:owner/repo#1")).toBeNull()
    })
  })

  test("a synchronous save on quit is read back the same", async () => {
    await inRepo(async () => {
      saveChatSync("local", saved)
      expect(await loadChat("local")).toEqual(saved)
    })
  })

  test("is null when missing, not JSON, or without entries", async () => {
    await inRepo(async (root) => {
      expect(await loadChat("local")).toBeNull()
      await writeChatFile(root, "{ not json")
      expect(await loadChat("local")).toBeNull()
      await writeChatFile(root, '{"sessionId": "s"}')
      expect(await loadChat("local")).toBeNull()
      await writeChatFile(root, "[]")
      expect(await loadChat("local")).toBeNull()
    })
  })

  test("drops entries it does not recognise and keeps the rest", async () => {
    await inRepo(async (root) => {
      await writeChatFile(
        root,
        JSON.stringify({
          sessionId: 7,
          entries: [
            { kind: "note", text: "Read failed", tone: "info" },
            { kind: "question", text: "q", labels: [] },
            { kind: "answer", text: 3, interrupted: false },
            "junk",
            { kind: "answer", text: "a", interrupted: true },
          ],
        }),
      )
      expect(await loadChat("local")).toEqual({
        sessionId: null,
        headSha: null,
        entries: [
          { kind: "question", text: "q", labels: [] },
          { kind: "answer", text: "a", interrupted: true },
        ],
      })
    })
  })

  test("clearing removes the file, and clearing a missing one is fine", async () => {
    await inRepo(async (root) => {
      await saveChat("local", saved)
      await clearChat("local")
      expect(existsSync(filePath(root))).toBe(false)
      expect(await loadChat("local")).toBeNull()
      await clearChat("local")
    })
  })

  test("a clear queued behind a save leaves no file", async () => {
    await inRepo(async (root) => {
      const save = saveChat("local", saved)
      const clear = clearChat("local")
      await Promise.all([save, clear])
      expect(existsSync(filePath(root))).toBe(false)
    })
  })
})

describe("the snapshot written on quit", () => {
  const older = (text: string): SavedChat => ({ ...saved, entries: [{ kind: "answer", text, interrupted: false }] })

  test("is not overwritten by saves queued before it", async () => {
    await inRepo(async () => {
      const a = saveChat("local", older("A"))
      const b = saveChat("local", older("B"))
      saveChatSync("local", saved)
      await Promise.all([a, b])
      expect(await loadChat("local")).toEqual(saved)
    })
  })

  test("is not removed by a clear queued before it, nor by a save or clear after it", async () => {
    await inRepo(async () => {
      const clear = clearChat("local")
      saveChatSync("local", saved)
      await clear
      await saveChat("local", older("late"))
      await clearChat("local")
      expect(await loadChat("local")).toEqual(saved)
    })
  })

  test("is not overwritten by a save whose write was already under way", async () => {
    await inRepo(async () => {
      const write = Bun.write
      const gate = Promise.withResolvers<void>()
      const started = Promise.withResolvers<void>()
      const spy = spyOn(Bun, "write").mockImplementation((async (...args: Parameters<typeof Bun.write>) => {
        started.resolve()
        await gate.promise
        return write(...args)
      }) as typeof Bun.write)
      try {
        const pending = saveChat("local", older("A"))
        await started.promise
        saveChatSync("local", older("B"))
        gate.resolve()
        await pending
        expect(await loadChat("local")).toEqual(older("B"))
      } finally {
        spy.mockRestore()
      }
    })
  })

  test("a save skipped after it leaves no temporary file behind", async () => {
    await inRepo(async (root) => {
      saveChatSync("local", saved)
      await saveChat("local", older("late"))
      expect(await readdir(join(root, ".riff", "local"))).toEqual(["chat.json"])
    })
  })
})

describe("which file holds a review's conversation", () => {
  test("a local revset gets its own, apart from the uncommitted changes' chat.json", async () => {
    await inRepo(async (root) => {
      await saveChat("@-", saved)
      expect(await loadChat("local")).toBeNull()
      expect(await loadChat("@-")).toEqual(saved)
      expect(existsSync(filePath(root))).toBe(false)
      const files = await readdir(join(root, ".riff", "local"))
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/^chat-[0-9a-f]{12}\.json$/)
    })
  })

  test("the uncommitted changes keep chat.json", async () => {
    await inRepo(async (root) => {
      await saveChat("local", saved)
      expect(existsSync(filePath(root))).toBe(true)
    })
  })

  test("a PR keeps chat.json in its own folder", async () => {
    await inRepo(async (root) => {
      await saveChat("gh:owner/repo#1", saved)
      const files = await readdir(join(root, ".riff"), { recursive: true })
      expect(files.filter((file) => file.endsWith(".json"))).toEqual([expect.stringMatching(/(^|\/)chat\.json$/)])
      expect(files.some((file) => file.startsWith("local"))).toBe(false)
      expect(await loadChat("gh:owner/repo#1")).toEqual(saved)
    })
  })
})
