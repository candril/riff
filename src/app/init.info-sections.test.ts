import { test, expect, afterAll } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { initializeAppState } from "./init"
import { prInfo } from "../testing/pr-info"

const roots: string[] = []

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

test("riff starts with the info panel sections the reader opened in this review, and none for another", async () => {
  const root = await mkdtemp(join(tmpdir(), "riff-init-info-sections-"))
  roots.push(root)
  await mkdir(join(root, ".git"), { recursive: true })
  await mkdir(join(root, ".riff", "local"), { recursive: true })
  await writeFile(join(root, ".riff", "local", "info-panel.json"), JSON.stringify({ openSections: ["files", "checks"] }))

  const cwd = process.cwd()
  process.chdir(root)
  try {
    // A preloaded diff keeps git out of it; without PR info the source is "local".
    const local = await initializeAppState({ mode: "pr", target: undefined, diff: "", comments: [] })
    expect(local.prInfoOpenSections).toEqual(new Set(["checks", "files"]))
    const pr = await initializeAppState({ mode: "pr", target: undefined, diff: "", comments: [], prInfo: prInfo("") })
    expect(pr.source).toBe("gh:owner/repo#1259")
    expect(pr.prInfoOpenSections).toEqual(new Set())
  } finally {
    process.chdir(cwd)
  }
})
