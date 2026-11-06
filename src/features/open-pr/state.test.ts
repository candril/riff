import { describe, expect, test } from "bun:test"
import type { PrLookups, PrSummary } from "../../providers/github/lookups"
import type { KnownRepo, RepoName } from "./known-repos"
import { createOpenPrState, type OpenPrChoice } from "./state"

const iso: KnownRepo = { owner: "acme", repo: "isomorph", alias: "ISO" }
const lane: KnownRepo = { owner: "me", repo: "lane" }
const web: KnownRepo = { owner: "acme", repo: "web" }
const pr = (title: string): PrSummary => ({ title, state: "OPEN", isDraft: false, author: "kim" })

function harness(options: { current?: RepoName | null; known?: KnownRepo[] } = {}) {
  const chosen: OpenPrChoice[] = []
  const asked: { repos: readonly RepoName[]; number: number }[] = []
  let settle: { resolve: (value: PrLookups) => void; reject: (error: Error) => void } | null = null
  const state = createOpenPrState({
    current: options.current ?? null,
    known: options.known ?? [iso, lane, web],
    lookup: (repos, number) => {
      asked.push({ repos, number })
      return new Promise((resolve, reject) => {
        settle = { resolve, reject }
      })
    },
    onChoose: (choice) => chosen.push(choice),
  })
  const land = async (entries: [string, PrSummary | null][]) => {
    settle!.resolve(new Map(entries))
    await Bun.sleep(0)
  }
  const fail = async (message: string) => {
    settle!.reject(new Error(message))
    await Bun.sleep(0)
  }
  return { state, chosen, asked, land, fail }
}

describe("a single repository", () => {
  test("a link opens once its PR is found", async () => {
    const { state, chosen, asked, land } = harness()
    state.submit("https://github.com/acme/web/pull/7/files")
    expect(state.checking()).toBe("Looking up acme/web#7…")
    expect(asked).toEqual([{ repos: [{ owner: "acme", repo: "web", number: 7 } as RepoName], number: 7 }])
    await land([["acme/web", pr("Fix")]])
    expect(chosen).toEqual([{ owner: "acme", repo: "web", number: 7 }])
  })

  test("an id in a repository needs no question", async () => {
    const { state, chosen, land } = harness({ current: lane })
    state.submit("#7")
    expect(state.pick()).toBeNull()
    await land([["me/lane", pr("Fix")]])
    expect(chosen[0]).toMatchObject({ owner: "me", repo: "lane", number: 7 })
  })

  test("a PR that does not exist stays on the screen and says so", async () => {
    const { state, chosen, land } = harness()
    state.submit("acme/web#7")
    await land([["acme/web", null]])
    expect(chosen).toEqual([])
    expect(state.checking()).toBeNull()
    expect(state.error()).toBe("There is no acme/web#7")
  })

  test("a failed lookup says what failed", async () => {
    const { state, fail } = harness()
    state.submit("acme/web#7")
    await fail("gh: not logged in")
    expect(state.error()).toBe("gh: not logged in")
  })

  test("text that is no reference says so without asking GitHub", () => {
    const { state, asked } = harness()
    state.submit("  what is this ")
    expect(state.error()).toBe(`Can't read "what is this" as a PR`)
    expect(asked).toEqual([])
  })

  test("an empty field does nothing", () => {
    const { state } = harness()
    state.submit("   ")
    expect(state.error()).toBeNull()
  })

  test("abandoning a lookup keeps it from opening anything", async () => {
    const { state, chosen, land } = harness()
    state.submit("acme/web#7")
    expect(state.back()).toBe(true)
    await land([["acme/web", pr("Fix")]])
    expect(chosen).toEqual([])
    expect(state.checking()).toBeNull()
  })

  test("an error is cleared by the next submit", () => {
    const { state } = harness()
    state.submit("nonsense here")
    state.submit("acme/web#7")
    expect(state.error()).toBeNull()
  })
})

describe("asking which repository", () => {
  test("lists every candidate at once, looking them all up in one call", () => {
    const { state, asked } = harness()
    state.submit("12")
    expect(state.pick()).toMatchObject({ number: 12, looking: true })
    expect(state.pick()!.rows.map((row) => row.repo)).toEqual([iso, lane, web])
    expect(asked).toEqual([{ repos: [iso, lane, web], number: 12 }])
  })

  test("the lookup labels the rows and drops repos without the PR", async () => {
    const { state, land } = harness()
    state.submit("12")
    await land([["acme/isomorph", null], ["me/lane", pr("Lane fix")], ["acme/web", pr("Web fix")]])
    expect(state.pick()).toMatchObject({ looking: false })
    expect(state.pick()!.rows.map((row) => [row.repo.repo, row.pr?.title])).toEqual([["lane", "Lane fix"], ["web", "Web fix"]])
  })

  test("the highlight stays on its repo as rows leave", async () => {
    const { state, land } = harness()
    state.submit("12")
    state.move(2)
    await land([["acme/isomorph", null], ["me/lane", pr("Lane fix")], ["acme/web", pr("Web fix")]])
    expect(state.highlight()).toBe(1)
  })

  test("the highlight wraps, and Enter opens what it is on without asking again", async () => {
    const { state, chosen, asked, land } = harness()
    state.submit("12")
    await land([["acme/isomorph", pr("A")], ["me/lane", pr("B")], ["acme/web", null]])
    state.move(-1)
    expect(state.highlight()).toBe(1)
    state.move(1)
    expect(state.highlight()).toBe(0)
    state.move(1)
    state.choose()
    expect(chosen).toEqual([{ owner: "me", repo: "lane", number: 12 }])
    expect(asked).toHaveLength(1)
  })

  test("Enter before the lookup lands opens the row anyway, and the lookup lands nowhere", async () => {
    const { state, chosen, land } = harness()
    state.submit("12")
    state.choose()
    expect(chosen).toEqual([{ owner: "acme", repo: "isomorph", number: 12 }])
    await land([])
    expect(state.pick()!.looking).toBe(true)
  })

  test("a failed lookup keeps the rows, unlabelled", async () => {
    const { state, fail } = harness()
    state.submit("12")
    await fail("offline")
    expect(state.pick()).toMatchObject({ looking: false })
    expect(state.pick()!.rows).toHaveLength(3)
    expect(state.error()).toBeNull()
  })

  test("no repo having the PR brings the field back and says so", async () => {
    const { state, land } = harness()
    state.submit("12")
    await land([])
    expect(state.pick()).toBeNull()
    expect(state.error()).toBe("None of the known repos has a #12, so paste owner/repo#12")
  })

  test("backing out returns to the field, and a late lookup does not bring the list back", async () => {
    const { state, land } = harness()
    state.submit("12")
    expect(state.back()).toBe(true)
    await land([["me/lane", pr("B")]])
    expect(state.pick()).toBeNull()
    expect(state.back()).toBe(false)
  })
})
