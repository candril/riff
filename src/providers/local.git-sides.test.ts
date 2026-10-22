import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { getGitFileContent, getGitOldFileContent } from "./local"

// A GIT_DIR or GIT_WORK_TREE from the caller's shell would point git away from the scratch repo.
const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...cleanEnv } = process.env

const roots: string[] = []
let root = ""

const git = (strings: TemplateStringsArray, ...values: string[]) =>
  $(strings, ...values).cwd(root).env(cleanEnv).quiet()

async function commit(content: string, message: string): Promise<void> {
  await writeFile(join(root, "a.txt"), content)
  await git`git add a.txt`
  await git`git -c user.name=t -c user.email=t@t commit -q -m ${message}`
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "riff-git-sides-"))
  roots.push(root)
  await git`git init -q`
  // A commit before c1 gives HEAD~1 a parent, so reading the wrong side shows as wrong text.
  await commit("zero\n", "c0")
  await commit("one\n", "c1")
  await commit("two\n", "c2")
  await writeFile(join(root, "a.txt"), "three\n")
})

afterAll(async () => {
  for (const dir of roots) await rm(dir, { recursive: true, force: true })
})

async function inRepo<T>(read: () => Promise<T>): Promise<T> {
  const cwd = process.cwd()
  process.chdir(root)
  try {
    return await read()
  } finally {
    process.chdir(cwd)
  }
}

const sides = (target?: string) =>
  inRepo(async () => [await getGitOldFileContent("a.txt", target), await getGitFileContent("a.txt", target)])

describe("the git readers serve the two sides the diff compares", () => {
  test("one revision runs from itself to the working tree, as `git diff <rev>` does", async () => {
    expect(await sides("HEAD~1")).toEqual(["one\n", "three\n"])

    const diff = await git`git diff HEAD~1 -- a.txt`.text()
    expect(diff).toContain("\n-one\n")
    expect(diff).toContain("\n+three\n")
  })

  test("a two-dot range runs from its left end to its right end", async () => {
    expect(await sides("HEAD~1..HEAD")).toEqual(["one\n", "two\n"])
  })

  test("no target runs from HEAD to the working tree", async () => {
    expect(await sides()).toEqual(["two\n", "three\n"])
  })
})
