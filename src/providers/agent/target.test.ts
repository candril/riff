import { expect, test } from "bun:test"
import { createInitialState } from "../../state"
import { TWO_FILES } from "../../testing/diffs"
import { prInfo } from "../../testing/pr-info"
import { parseDiff } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { agentFilesOf, agentTargetOf, hiddenFileCount } from "./target"

const files = parseDiff(TWO_FILES)

test("a PR review targets the PR, its ref, state, author and description", () => {
  const pr = prInfo("Adds the skill.")
  const state = createInitialState(files, buildFileTree(files), "gh:owner/repo#1259", "", null, null, [], "pr", pr)
  expect(agentTargetOf(state)).toEqual({
    kind: "pr",
    owner: "owner",
    repo: "repo",
    number: 1259,
    title: "Add the update-tv-channels skill",
    state: "open",
    author: "someone",
    description: "Adds the skill.",
  })
})

test("a local review targets the branch line and the description riff already holds", () => {
  const state = {
    ...createInitialState(files, buildFileTree(files), "local", "Changes since trunk"),
    branchInfo: "feature → main",
  }
  expect(agentTargetOf(state)).toEqual({
    kind: "local",
    label: "feature → main",
    description: "Changes since trunk",
  })
})

test("the changed files carry their status and counts", () => {
  const state = createInitialState(files, buildFileTree(files), "local", "")
  expect(agentFilesOf(state)).toEqual(
    files.map((f) => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions })),
  )
})

test("files the reviewer's ignore patterns hide are left out and counted", () => {
  const state = {
    ...createInitialState(files, buildFileTree(files), "local", ""),
    ignoredFiles: new Set([files[1]!.filename]),
  }
  expect(agentFilesOf(state).map((f) => f.path)).toEqual([files[0]!.filename])
  expect(hiddenFileCount(state)).toBe(1)
})
