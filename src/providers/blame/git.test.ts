import { expect, test } from "bun:test"
import { parseGitBlamePorcelain } from "./git"

const A = "204703d97324d5e27aef19adefd7c78febb9e2f1"
const B = "5706210c7a3780d220b24eb335ec4fb872f97ffe"

test("porcelain headers given once per commit carry over to its later groups; the zero sha is uncommitted", () => {
  const porcelain = [
    `${A} 1 1 2`,
    "author Ada Lovelace",
    "author-mail <ada@example.com>",
    "author-time 1788717457",
    "author-tz +0200",
    "summary first commit",
    "filename a.ts",
    "\tline one",
    `${A} 2 2`,
    "\tline two",
    `${B} 3 3 1`,
    "author Grace Hopper",
    "author-time 1790000000",
    "author-tz -0500",
    "summary second commit",
    "filename a.ts",
    "\tline three",
    `${A} 4 4 1`,
    "\tline four",
    `${"0".repeat(40)} 5 5 1`,
    "author Not Committed Yet",
    "author-time 1790000100",
    "author-tz +0000",
    "summary Version of a.ts from a.ts",
    "filename a.ts",
    "\tline five",
    "",
  ].join("\n")
  const blame = parseGitBlamePorcelain(porcelain)
  expect(blame[1]).toEqual({
    kind: "commit",
    commit: { sha: A, shortSha: "204703d9", author: "Ada Lovelace", date: "2026-09-06T19:57:37+02:00", subject: "first commit" },
  })
  expect(blame[2]).toEqual(blame[1])
  expect(blame[3]).toMatchObject({ commit: { sha: B, author: "Grace Hopper", date: "2026-09-21T09:13:20-05:00" } })
  expect(blame[4]).toEqual(blame[1])
  expect(blame[5]).toEqual({ kind: "uncommitted" })
  expect(blame.length).toBe(6)
})
