import { test, expect, describe, afterAll } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { loadMarks, saveMarks } from "./storage"
import type { Mark } from "./features/marks/types"

const roots: string[] = []

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "riff-marks-"))
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

async function writeMarks(root: string, text: string): Promise<void> {
  await mkdir(join(root, ".riff", "local"), { recursive: true })
  await writeFile(join(root, ".riff", "local", "marks.json"), text)
}

describe("the marks file", () => {
  test("gives back what was saved, a file mark's null line included", async () => {
    const marks: Mark[] = [
      { letter: "a", filename: "src/x.ts", line: 42, side: "LEFT" },
      { letter: "B", filename: "src/y.ts", line: null, side: "RIGHT" },
    ]
    await inRepo(async (root) => {
      await saveMarks("local", marks)
      expect(await readFile(join(root, ".riff", "local", "marks.json"), "utf8")).toContain('"line": null')
      expect(await loadMarks("local")).toEqual(marks)
    })
  })

  test("is no marks when it is missing or not JSON", async () => {
    await inRepo(async (root) => {
      expect(await loadMarks("local")).toEqual([])
      await writeMarks(root, "{ not json")
      expect(await loadMarks("local")).toEqual([])
      await writeMarks(root, '{"a": 1}')
      expect(await loadMarks("local")).toEqual([])
    })
  })

  test("drops the entries that are not marks and keeps the rest", async () => {
    const good = { letter: "a", filename: "src/x.ts", line: 1, side: "RIGHT" }
    await inRepo(async (root) => {
      await writeMarks(
        root,
        JSON.stringify([
          good,
          null,
          "a",
          { ...good, letter: "1" },
          { ...good, letter: "ab" },
          { ...good, filename: 7 },
          { ...good, line: 0 },
          { ...good, line: 2.5 },
          { ...good, line: "3" },
          { letter: "c", filename: "src/x.ts", side: "RIGHT" },
          { ...good, side: "BOTH" },
        ])
      )
      expect(await loadMarks("local")).toEqual([good as Mark])
    })
  })

  test("keeps the last place of a letter written twice", async () => {
    await inRepo(async (root) => {
      await writeMarks(
        root,
        JSON.stringify([
          { letter: "a", filename: "src/x.ts", line: 1, side: "RIGHT" },
          { letter: "b", filename: "src/x.ts", line: 2, side: "RIGHT" },
          { letter: "a", filename: "src/y.ts", line: 9, side: "LEFT" },
        ])
      )
      expect(await loadMarks("local")).toEqual([
        { letter: "b", filename: "src/x.ts", line: 2, side: "RIGHT" },
        { letter: "a", filename: "src/y.ts", line: 9, side: "LEFT" },
      ])
    })
  })
})
