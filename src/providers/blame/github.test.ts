import { expect, test } from "bun:test"
import { parseGithubBlame } from "./github"

const A = "204703d97324d5e27aef19adefd7c78febb9e2f1"
const B = "5706210c7a3780d220b24eb335ec4fb872f97ffe"

const range = (start: number, end: number, oid: string, extra: object) => ({
  startingLine: start,
  endingLine: end,
  commit: {
    oid,
    abbreviatedOid: oid.slice(0, 7),
    committedDate: "2026-10-02T10:00:00Z",
    messageHeadline: `subject of ${oid.slice(0, 4)}`,
    ...extra,
  },
})

test("GitHub's ranges spread over their lines, with the PR of the commit that has one", () => {
  const json = {
    data: {
      repository: {
        object: {
          blame: {
            ranges: [
              range(1, 2, A, {
                author: { name: "Ada Lovelace", date: "2026-10-01T09:00:00Z", user: { login: "ada" } },
                associatedPullRequests: { nodes: [{ number: 42, url: "https://github.com/o/r/pull/42" }] },
              }),
              range(3, 3, B, { author: { name: null, date: null, user: null }, associatedPullRequests: { nodes: [] } }),
            ],
          },
        },
      },
    },
  }
  const parsed = parseGithubBlame(json)!
  expect(parsed.blame.length).toBe(4)
  expect(parsed.blame[2]).toEqual({
    kind: "commit",
    commit: { sha: A, shortSha: "204703d9", author: "Ada Lovelace", date: "2026-10-01T09:00:00Z", subject: "subject of 2047" },
  })
  expect(parsed.blame[3]).toMatchObject({ commit: { author: "unknown", date: "2026-10-02T10:00:00Z" } })
  expect([...parsed.prs]).toEqual([[A, { number: 42, url: "https://github.com/o/r/pull/42" }]])
})

test("a GitHub author with no name falls back to the login", () => {
  const json = {
    data: { repository: { object: { blame: { ranges: [range(1, 1, A, { author: { name: "", date: null, user: { login: "ada" } } })] } } } },
  }
  expect(parseGithubBlame(json)!.blame[1]).toMatchObject({ commit: { author: "ada" } })
})

test("a revision GitHub does not have is no blame", () => {
  expect(parseGithubBlame({ data: { repository: { object: null } } })).toBeNull()
})
