import { afterAll, beforeAll, expect, test } from "bun:test"
import { $ } from "bun"
import { mkdir, mkdtemp, realpath, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { createInitialState } from "../../state"
import { TWO_FILES } from "../../testing/diffs"
import { parseDiff } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { createBlameSource } from "./source"

// A GIT_DIR or GIT_WORK_TREE from the caller's shell would point git away from the scratch repo,
// and the runners under test spawn git with process.env, so it is cleaned too.
const GIT_VARS = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"] as const
const saved = GIT_VARS.map((name) => [name, process.env[name]] as const)
const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...cleanEnv } = process.env

let root = ""

const git = (strings: TemplateStringsArray, ...values: string[]) =>
  $(strings, ...values).cwd(root).env(cleanEnv).quiet()

beforeAll(async () => {
  for (const name of GIT_VARS) delete process.env[name]
  root = await realpath(await mkdtemp(join(tmpdir(), "riff-blame-subdir-")))
  await mkdir(join(root, "src"))
  await writeFile(join(root, "src", "a.ts"), "one\ntwo\n")
  await git`git init -q`
  await git`git add src/a.ts`
  await git`git -c user.name=t -c user.email=t@t commit -q -m c1`
})

afterAll(async () => {
  for (const [name, value] of saved) if (value !== undefined) process.env[name] = value
  await rm(root, { recursive: true, force: true })
})

test("a file is blamed by its repository path when riff runs from a subdirectory", async () => {
  const files = parseDiff(TWO_FILES)
  const state = createInitialState(files, buildFileTree(files), "local", "")
  const cwd = process.cwd()
  process.chdir(join(root, "src"))
  try {
    const source = createBlameSource({
      state: () => state,
      target: undefined,
      headSha: () => null,
      // detectVcs is memoised for the whole test process, so the scratch repo's kind is given.
      runners: { vcs: async () => "git" },
    })
    const loaded = await source.fileBlame("src/a.ts", "head")
    expect(loaded?.blame.slice(1).map((line) => line?.kind)).toEqual(["commit", "commit"])
  } finally {
    process.chdir(cwd)
  }
})
