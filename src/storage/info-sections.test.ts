import { test, expect, describe, afterAll } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { loadInfoSections, saveInfoSections } from "./info-sections"

const roots: string[] = []

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

async function inRepo<T>(run: (root: string) => Promise<T>): Promise<T> {
  const cwd = process.cwd()
  const root = await mkdtemp(join(tmpdir(), "riff-info-sections-"))
  roots.push(root)
  await mkdir(join(root, ".git"), { recursive: true })
  process.chdir(root)
  try {
    return await run(root)
  } finally {
    process.chdir(cwd)
  }
}

const filePath = (root: string) => join(root, ".riff", "local", "info-panel.json")

async function writeInfoPanel(root: string, text: string): Promise<void> {
  await mkdir(join(root, ".riff", "local"), { recursive: true })
  await writeFile(filePath(root), text)
}

describe("the info panel file", () => {
  test("gives back the sections saved for the review, and none for another", async () => {
    await inRepo(async (root) => {
      await saveInfoSections("local", new Set(["files", "checks"]))
      expect(await loadInfoSections("local")).toEqual(new Set(["checks", "files"]))
      expect(await loadInfoSections("gh:owner/repo#1")).toEqual(new Set())
      expect(JSON.parse(await readFile(filePath(root), "utf8"))).toEqual({ openSections: ["checks", "files"] })
    })
  })

  test("opens nothing when it is missing, not JSON, or not a list", async () => {
    await inRepo(async (root) => {
      expect(await loadInfoSections("local")).toEqual(new Set())
      await writeInfoPanel(root, "{ not json")
      expect(await loadInfoSections("local")).toEqual(new Set())
      await writeInfoPanel(root, '{"openSections": "files"}')
      expect(await loadInfoSections("local")).toEqual(new Set())
      await writeInfoPanel(root, '["files"]')
      expect(await loadInfoSections("local")).toEqual(new Set())
    })
  })

  test("drops names it does not know and keeps the rest", async () => {
    await inRepo(async (root) => {
      await writeInfoPanel(root, '{"openSections": ["files", "reviews", 3, "description"]}')
      expect(await loadInfoSections("local")).toEqual(new Set(["description", "files"]))
    })
  })

  test("two saves fired back to back leave the second on disk", async () => {
    await inRepo(async () => {
      const first = saveInfoSections("local", new Set(["files", "commits", "conversation"]))
      const second = saveInfoSections("local", new Set(["description"]))
      await Promise.all([first, second])
      expect(await loadInfoSections("local")).toEqual(new Set(["description"]))
    })
  })
})
