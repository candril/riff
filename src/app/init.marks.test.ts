import { test, expect, afterAll } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { initializeAppState } from "./init"
import { createMarksState } from "../features/marks/state"
import type { Mark } from "../features/marks/types"
import { X_SHIFTED } from "../testing/marks"

const roots: string[] = []

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

test("the marks saved with the review are back when riff starts, with none visited yet", async () => {
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
    const { marks } = await initializeAppState({ mode: "pr", target: undefined, diff: "", comments: [] })
    const state = createMarksState()
    state.reset(marks)
    expect(state.snapshot()).toEqual({ marks: saved, current: null, previous: null })
  } finally {
    process.chdir(cwd)
  }
})

test("a mark whose line the diff has moved comes back on its new line, and is saved there", async () => {
  const root = await mkdtemp(join(tmpdir(), "riff-init-marks-"))
  roots.push(root)
  await mkdir(join(root, ".git"), { recursive: true })
  const saved: Mark[] = [{ letter: "a", filename: "src/x.ts", line: 10, side: "RIGHT", text: "n10" }]
  await mkdir(join(root, ".riff", "local"), { recursive: true })
  await writeFile(join(root, ".riff", "local", "marks.json"), JSON.stringify(saved))

  const cwd = process.cwd()
  process.chdir(root)
  try {
    const { marks } = await initializeAppState({ mode: "pr", target: undefined, diff: X_SHIFTED.content, comments: [], headSha: "abc123" })
    const moved = { ...saved[0]!, line: 12, head: "abc123" }
    expect(marks).toEqual([moved])
    expect(JSON.parse(await readFile(join(root, ".riff", "local", "marks.json"), "utf8"))).toEqual([moved])
  } finally {
    process.chdir(cwd)
  }
})
