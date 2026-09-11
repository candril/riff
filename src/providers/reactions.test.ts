import { test, expect, describe } from "bun:test"
import { parseReactionGroupsForTest as parse } from "./github"

describe("reading reactions off the API", () => {
  test("GraphQL's names are riff's names", () => {
    const summary = parse([
      { content: "THUMBS_UP", viewerHasReacted: true, reactors: { totalCount: 3 } },
      { content: "ROCKET", viewerHasReacted: false, reactors: { totalCount: 1 } },
    ])

    expect(summary).toEqual([
      { content: "+1", count: 3, viewerHasReacted: true },
      { content: "rocket", count: 1, viewerHasReacted: false },
    ])
  })

  test("REST's names still are too", () => {
    expect(parse([{ content: "heart", viewerHasReacted: false, reactors: { totalCount: 2 } }])).toEqual([
      { content: "heart", count: 2, viewerHasReacted: false },
    ])
  })

  test("a group nobody is in is not a reaction", () => {
    expect(parse([{ content: "EYES", viewerHasReacted: false, reactors: { totalCount: 0 } }])).toEqual([])
  })

  test("your own reaction counts even where the count has not caught up", () => {
    expect(parse([{ content: "EYES", viewerHasReacted: true, reactors: { totalCount: 0 } }])).toEqual([
      { content: "eyes", count: 0, viewerHasReacted: true },
    ])
  })

  test("a name riff does not know is left out rather than guessed at", () => {
    expect(parse([{ content: "SOMETHING_NEW", viewerHasReacted: true, reactors: { totalCount: 9 } }])).toEqual([])
  })
})
