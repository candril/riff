import { expect, test } from "bun:test"
import { parseJjAnnotate } from "./jj"

const A = "204703d97324d5e27aef19adefd7c78febb9e2f1"
const B = "5706210c7a3780d220b24eb335ec4fb872f97ffe"

test("jj's annotate records become one commit per line, in line order", () => {
  // Shaped like `jj file annotate -T JJ_ANNOTATE_TEMPLATE` output; the second commit, with an empty subject, is made up.
  const sample = [
    `1\x1f${A}\x1fAda Lovelace\x1f2026-09-06T17:57:37Z\x1falign distribution and docs: brew tap, nix`,
    `2\x1f${A}\x1fAda Lovelace\x1f2026-09-06T17:57:37Z\x1falign distribution and docs: brew tap, nix`,
    `3\x1f${B}\x1fGrace Hopper\x1f2026-10-01T08:00:00Z\x1f`,
    "",
  ].join("\n")
  const blame = parseJjAnnotate(sample)
  expect(blame.length).toBe(4)
  expect(blame[0]).toBeUndefined()
  expect(blame[1]).toEqual({
    kind: "commit",
    commit: {
      sha: A,
      shortSha: "204703d9",
      author: "Ada Lovelace",
      date: "2026-09-06T17:57:37Z",
      subject: "align distribution and docs: brew tap, nix",
    },
  })
  expect(blame[3]).toMatchObject({ commit: { sha: B, author: "Grace Hopper", subject: "" } })
})
