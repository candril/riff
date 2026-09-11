import { test, expect, describe, afterAll } from "bun:test"
import { mkdtemp, mkdir, writeFile, readdir } from "fs/promises"
import { rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { commentFilePath, loadComments } from "./storage"

const roots: string[] = []

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "riff-storage-"))
  roots.push(root)
  await mkdir(join(root, ".git"), { recursive: true })
  return root
}

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

function commentFile(body: string): string {
  return `---\nid: ${body}-0000-0000-0000-000000000000\nfilename: src/app.ts\nline: 12\nside: RIGHT\ncreatedAt: 2026-09-11T09:00:00Z\nstatus: local\nauthor: "@you"\n---\n\n${body}\n`
}

describe("where a local review's comments live", () => {
  test("every revset is the same review — only a PR gets its own store", async () => {
    const cwd = process.cwd()
    process.chdir(await repo())
    try {
      const plain = await commentFilePath("aaaaaaaa-0000-0000-0000-000000000000", "local")
      const revset = await commentFilePath("aaaaaaaa-0000-0000-0000-000000000000", "@-")
      const pr = await commentFilePath("aaaaaaaa-0000-0000-0000-000000000000", "gh:o/r#1")

      expect(revset).toBe(plain)
      expect(pr).not.toBe(plain)
      expect(pr).toContain("gh-o-r-1")
    } finally {
      process.chdir(cwd)
    }
  })

  test("notes filed under an old revset folder are folded in, once", async () => {
    const cwd = process.cwd()
    const root = await repo()
    process.chdir(root)
    try {
      await mkdir(join(root, ".riff", "comments", "@-"), { recursive: true })
      await writeFile(join(root, ".riff", "comments", "@-", "bbbbbbbb.md"), commentFile("bbbbbbbb"))

      const comments = await loadComments("local")

      expect(comments.map((c) => c.body)).toEqual(["bbbbbbbb"])
      // Moved, not copied: an edit must not leave a stale twin behind.
      expect(await readdir(join(root, ".riff", "comments", "@-"))).toEqual([])
      expect(await readdir(join(root, ".riff", "comments", "local"))).toEqual(["bbbbbbbb.md"])
    } finally {
      process.chdir(cwd)
    }
  })
})
