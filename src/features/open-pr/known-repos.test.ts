import { expect, test } from "bun:test"
import { mergeKnownRepos, prestoRepos } from "./known-repos"

test("presto's repositories keep their alias and order, disabled ones included", () => {
  const toml = `
[[repositories]]
name = "acme/isomorph"
alias = "ISO"
starredOnly = true

[[repositories]]
name = "me/lane"
disabled = true

[tools]
editor = "nvim"
`
  expect(prestoRepos(toml)).toEqual([
    { owner: "acme", repo: "isomorph", alias: "ISO" },
    { owner: "me", repo: "lane" },
  ])
})

test("a config without repositories, or with nonsense in them, gives none of the nonsense", () => {
  expect(prestoRepos(`[tools]\neditor = "nvim"`)).toEqual([])
  expect(prestoRepos(`[[repositories]]\nname = "no-slash"\n[[repositories]]\nname = "a/b/c"\n[[repositories]]\nalias = "x"`)).toEqual([])
})

test("riff's own mappings follow presto's, without repeating one in another case", () => {
  const merged = mergeKnownRepos([{ owner: "acme", repo: "Web", alias: "W" }], {
    "ACME/web": "/somewhere",
    "me/riff": "/elsewhere",
    nonsense: "/nowhere",
  })
  expect(merged).toEqual([
    { owner: "acme", repo: "Web", alias: "W" },
    { owner: "me", repo: "riff" },
  ])
})
