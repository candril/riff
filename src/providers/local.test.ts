import { test, expect, describe } from "bun:test"
import { parseGitCommits, parseJjCommits, EMPTY_CHANGE, UNDESCRIBED_CHANGE } from "./local"

describe("the local commits the picker lists", () => {
  test("jj says which changes are empty", () => {
    const log = [
      "b9a5860\x00\x00Stefan\x002026-09-11T09:00:00Z\x00empty",
      "5644f30\x00fix: the thing\x00Stefan\x002026-09-11T08:00:00Z\x00",
    ].join("\n")

    expect(parseJjCommits(log)).toEqual([
      {
        sha: "b9a5860",
        message: UNDESCRIBED_CHANGE,
        author: "Stefan",
        date: "2026-09-11T09:00:00Z",
        empty: true,
      },
      {
        sha: "5644f30",
        message: "fix: the thing",
        author: "Stefan",
        date: "2026-09-11T08:00:00Z",
        empty: false,
      },
    ])
  })

  test("git's empty commit is the one with no files under it", () => {
    const log =
      "\x01abc1234\x00chore: mark a release\x00Stefan\x002026-09-11T09:00:00Z\n\n" +
      "\x01def5678\x00fix: the thing\x00Stefan\x002026-09-11T08:00:00Z\n\nsrc/app.ts\nREADME.md\n"

    expect(parseGitCommits(log).map((c) => [c.sha, c.empty])).toEqual([
      ["abc1234", true],
      ["def5678", false],
    ])
  })

  test("an unnamed change is called that rather than drawn as a blank row", () => {
    expect(parseJjCommits("abc1234\x00\x00Stefan\x002026-09-11T09:00:00Z\x00")[0]?.message).toBe(
      UNDESCRIBED_CHANGE,
    )
    expect(EMPTY_CHANGE).toBe("(empty)")
  })
})
