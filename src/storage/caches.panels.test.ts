import { test, expect, describe, afterAll } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { loadPanelFilters, savePanelFilters, updatePanelFilters } from "./caches"

const roots: string[] = []

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "riff-panels-"))
  roots.push(root)
  await mkdir(join(root, ".git"), { recursive: true })
  return root
}

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

async function inRepo<T>(run: (root: string) => Promise<T>): Promise<T> {
  const cwd = process.cwd()
  const root = await repo()
  process.chdir(root)
  try {
    return await run(root)
  } finally {
    process.chdir(cwd)
  }
}

async function writePanels(root: string, text: string): Promise<void> {
  await mkdir(join(root, ".riff", "local"), { recursive: true })
  await writeFile(join(root, ".riff", "local", "panels.json"), text)
}

const NONE = { openThreadsOnly: false, unviewedFilesOnly: false }

describe("the panels file", () => {
  test("gives back what was saved, per review", async () => {
    await inRepo(async () => {
      await savePanelFilters("local", { openThreadsOnly: true, unviewedFilesOnly: false })
      expect(await loadPanelFilters("local")).toEqual({ openThreadsOnly: true, unviewedFilesOnly: false })
      expect(await loadPanelFilters("gh:owner/repo#1")).toEqual(NONE)
    })
  })

  test("hides nothing when it is missing or not JSON", async () => {
    await inRepo(async (root) => {
      expect(await loadPanelFilters("local")).toEqual(NONE)
      await writePanels(root, "{ not json")
      expect(await loadPanelFilters("local")).toEqual(NONE)
      await writePanels(root, "[true]")
      expect(await loadPanelFilters("local")).toEqual(NONE)
    })
  })

  test("reads a missing or mistyped field as off", async () => {
    await inRepo(async (root) => {
      await writePanels(root, '{"unviewedFilesOnly": true}')
      expect(await loadPanelFilters("local")).toEqual({ openThreadsOnly: false, unviewedFilesOnly: true })
      await writePanels(root, '{"openThreadsOnly": "yes"}')
      expect(await loadPanelFilters("local")).toEqual(NONE)
    })
  })
})

describe("updating one filter", () => {
  test("keeps the other field as the file has it", async () => {
    await inRepo(async () => {
      await savePanelFilters("local", { openThreadsOnly: true, unviewedFilesOnly: false })
      await updatePanelFilters("local", { unviewedFilesOnly: true })
      expect(await loadPanelFilters("local")).toEqual({ openThreadsOnly: true, unviewedFilesOnly: true })
      await updatePanelFilters("local", { openThreadsOnly: false })
      expect(await loadPanelFilters("local")).toEqual({ openThreadsOnly: false, unviewedFilesOnly: true })
    })
  })

  test("overlapping updates, not awaited between, leave the last value of each field", async () => {
    await inRepo(async () => {
      const writes: Promise<void>[] = []
      for (let i = 0; i < 10; i++) {
        writes.push(updatePanelFilters("local", { unviewedFilesOnly: i % 2 === 0 }))
        writes.push(updatePanelFilters("local", { openThreadsOnly: i % 2 === 1 }))
      }
      await Promise.all(writes)
      expect(await loadPanelFilters("local")).toEqual({ openThreadsOnly: true, unviewedFilesOnly: false })
    })
  })
})
