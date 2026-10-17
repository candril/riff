import { test, expect, afterAll } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { initializeAppState } from "./init"
import type { Mark } from "../features/marks/types"

const roots: string[] = []

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

test("the marks saved with the review are back in state when riff starts, with none visited yet", async () => {
  const root = await mkdtemp(join(tmpdir(), "riff-init-marks-"))
  roots.push(root)
  await mkdir(join(root, ".git"), { recursive: true })
  const saved: Mark[] = [
    { letter: "a", filename: "src/x.ts", line: 4, side: "LEFT" },
    { letter: "B", filename: "src/y.ts", line: null, side: "RIGHT" },
  ]
  await mkdir(join(root, ".riff", "local"), { recursive: true })
  await writeFile(join(root, ".riff", "local", "marks.json"), JSON.stringify(saved))

  const cwd = process.cwd()
  process.chdir(root)
  try {
    // A preloaded diff keeps git out of it; without PR info the source is "local".
    const { state } = await initializeAppState({ mode: "pr", target: undefined, diff: "", comments: [] })
    expect(state.marks).toEqual({ marks: saved, current: null, previous: null })
  } finally {
    process.chdir(cwd)
  }
})
