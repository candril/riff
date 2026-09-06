import { describe, expect, test } from "bun:test"
import { buildFileTree, filterTree, flattenTree } from "./file-tree"
import type { DiffFile } from "./diff-parser"

function file(filename: string): DiffFile {
  return {
    filename,
    status: "modified",
    additions: 1,
    deletions: 0,
    content: "",
    hunks: [],
  } as unknown as DiffFile
}

const files = [
  file("src/api/client.ts"),
  file("src/api/limiter.ts"),
  file("src/cart/cart.ts"),
  file("README.md"),
]

/** Paths of the file nodes a filtered tree would render. */
function visiblePaths(query: string): string[] {
  return flattenTree(filterTree(buildFileTree(files), query), files)
    .filter((item) => !item.node.isDirectory)
    .map((item) => item.node.path)
}

describe("filterTree", () => {
  test("an empty query changes nothing", () => {
    expect(visiblePaths("")).toEqual(files.map((f) => f.filename))
    expect(visiblePaths("   ")).toEqual(files.map((f) => f.filename))
  })

  test("keeps the files whose path matches", () => {
    expect(visiblePaths("client")).toEqual(["src/api/client.ts"])
    expect(visiblePaths("README")).toEqual(["README.md"])
  })

  test("matches a directory by name, with everything under it", () => {
    expect(visiblePaths("api")).toEqual(["src/api/client.ts", "src/api/limiter.ts"])
  })

  test("matches loosely, on the whole path", () => {
    expect(visiblePaths("apicl")).toEqual(["src/api/client.ts"])
    expect(visiblePaths("srcts")).toEqual([
      "src/api/client.ts",
      "src/api/limiter.ts",
      "src/cart/cart.ts",
    ])
  })

  test("a query nothing matches leaves an empty tree", () => {
    expect(visiblePaths("zzzz")).toEqual([])
  })

  test("surviving directories are expanded, so matches can't hide in a fold", () => {
    const collapsed = buildFileTree(files).map((n) => ({ ...n, expanded: false }))
    expect(
      flattenTree(filterTree(collapsed, "limiter"), files)
        .filter((i) => !i.node.isDirectory)
        .map((i) => i.node.path),
    ).toEqual(["src/api/limiter.ts"])
  })

  test("filtering leaves the original tree untouched", () => {
    const tree = buildFileTree(files)
    const before = JSON.stringify(tree)
    filterTree(tree, "client")
    expect(JSON.stringify(tree)).toBe(before)
  })
})
