import { afterEach, expect, test } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { render } from "@opentui/solid"
import type { PrLookups } from "../providers/github/lookups"
import { trimFrame } from "../testing/frame"
import { openPrTree, type OpenPrOutcome, type OpenPrScreenDeps } from "./open-pr"

let setup: TestRendererSetup | null = null
afterEach(() => {
  setup?.renderer.destroy()
  setup = null
})

const LOOKUPS: PrLookups = new Map([
  ["acme/isomorph", { title: "Fix the cart", state: "OPEN", isDraft: false, author: "kim" }],
  ["me/lane", { title: "Old thing", state: "MERGED", isDraft: false, author: null }],
  ["acme/web", null],
])

async function mount(deps: Partial<OpenPrScreenDeps> = {}) {
  setup = await createTestRenderer({ width: 90, height: 24 })
  const mounted = setup
  const outcomes: OpenPrOutcome[] = []
  const tree = openPrTree(
    mounted.renderer,
    {
      current: null,
      known: [{ owner: "acme", repo: "isomorph", alias: "ISO" }, { owner: "me", repo: "lane" }, { owner: "acme", repo: "web" }],
      lookup: async () => LOOKUPS,
      hasLocalReview: false,
      nothingHere: "Not in a repository",
      ...deps,
    },
    (outcome) => outcomes.push(outcome)
  )
  await render(tree, mounted.renderer)
  const frame = async () => {
    await Bun.sleep(0)
    await mounted.renderOnce()
    await mounted.renderOnce()
    return trimFrame(mounted.captureCharFrame())
  }
  const typeAndEnter = async (text: string) => {
    await mounted.mockInput.typeText(text)
    mounted.mockInput.pressEnter()
    return frame()
  }
  // A lone ESC byte is held back a moment, in case it starts an escape sequence.
  const escape = async () => {
    mounted.mockInput.pressEscape()
    await Bun.sleep(40)
  }
  return { ...mounted, outcomes, frame, typeAndEnter, escape }
}

test("says why it is showing, what can be typed, and what Esc does", async () => {
  const { frame } = await mount()
  const drawn = await frame()
  expect(drawn).toContain("Not in a repository")
  expect(drawn).toContain("Open a PR")
  expect(drawn).toContain("Paste a link, or 123, repo#123, owner/repo#123")
  expect(drawn).toContain("Esc quit")
})

test("in a checkout it names the repo an id means, and Esc goes to its review", async () => {
  const { frame, escape, outcomes } = await mount({ current: { owner: "me", repo: "riff" }, hasLocalReview: true, nothingHere: "No changes" })
  const drawn = await frame()
  expect(drawn).toContain("Open a PR in me/riff, or any other")
  expect(drawn).toContain("Esc review this checkout")
  await escape()
  expect(outcomes).toEqual([{ kind: "local" }])
})

test("Esc quits where there is nothing to go to", async () => {
  const { escape, outcomes, frame } = await mount()
  await frame()
  await escape()
  expect(outcomes).toEqual([{ kind: "quit" }])
})

test("a pasted link opens its PR", async () => {
  const { mockInput, outcomes, frame } = await mount({
    lookup: async () => new Map([["acme/web", { title: "Fix", state: "OPEN", isDraft: false, author: "kim" }]]),
  })
  await frame()
  await mockInput.pasteBracketedText("https://github.com/acme/web/pull/7/files")
  mockInput.pressEnter()
  await frame()
  expect(outcomes).toEqual([{ kind: "pr", choice: { owner: "acme", repo: "web", number: 7 } }])
})

test("an id in a checkout opens there without asking", async () => {
  const { typeAndEnter, outcomes } = await mount({
    current: { owner: "me", repo: "riff" },
    lookup: async () => new Map([["me/riff", { title: "Fix", state: "OPEN", isDraft: false, author: "kim" }]]),
  })
  await typeAndEnter("42")
  expect(outcomes).toEqual([{ kind: "pr", choice: { owner: "me", repo: "riff", number: 42 } }])
})

test("a PR that does not exist is said under the field, with the text kept", async () => {
  const { typeAndEnter, outcomes } = await mount({ lookup: async () => new Map([["acme/web", null]]) })
  const drawn = await typeAndEnter("acme/web#7")
  expect(drawn).toContain("There is no acme/web#7")
  expect(drawn.replace("There is no acme/web#7", "")).toContain("acme/web#7")
  expect(outcomes).toEqual([])
})

test("editing the field takes back an error about what it held", async () => {
  const { typeAndEnter, mockInput, frame } = await mount()
  expect(await typeAndEnter("nonsense here")).toContain(`Can't read "nonsense here" as a PR`)
  await mockInput.typeText("x")
  expect(await frame()).not.toContain("Can't read")
})

test("an id outside a repo asks, showing only the repos that have it, with what each one is", async () => {
  const { typeAndEnter, outcomes } = await mount()
  const drawn = await typeAndEnter("12")
  expect(outcomes).toEqual([])
  expect(drawn).toContain("Which repo is #12 in?")
  expect(drawn).toContain("acme/isomorph")
  expect(drawn).toContain("Fix the cart · @kim")
  expect(drawn).toContain("Old thing · merged")
  expect(drawn).not.toContain("acme/web")
})

test("the list takes j and Enter rather than the field taking them", async () => {
  const { typeAndEnter, mockInput, frame, outcomes } = await mount()
  await typeAndEnter("12")
  mockInput.pressKey("j")
  await frame()
  mockInput.pressEnter()
  await frame()
  expect(outcomes).toEqual([{ kind: "pr", choice: { owner: "me", repo: "lane", number: 12 } }])
})

test("Esc from the list returns to the field with its text, which takes typing again", async () => {
  const { typeAndEnter, mockInput, escape, frame, outcomes } = await mount({
    lookup: async (repos) => (repos.length === 1 ? new Map([["acme/isomorph", LOOKUPS.get("acme/isomorph")!]]) : LOOKUPS),
  })
  await typeAndEnter("12")
  mockInput.pressKey("j")
  await escape()
  const drawn = await frame()
  expect(drawn).toContain("Open a PR")
  expect(drawn).toContain("12")
  expect(drawn).not.toContain("12j")
  expect(outcomes).toEqual([])
  for (let i = 0; i < 2; i++) mockInput.pressBackspace()
  await typeAndEnter("iso#3")
  expect(outcomes).toEqual([{ kind: "pr", choice: { owner: "acme", repo: "isomorph", number: 3 } }])
})

test("a narrow terminal truncates a row rather than wrapping it", async () => {
  setup = await createTestRenderer({ width: 40, height: 16 })
  const mounted = setup
  const tree = openPrTree(
    mounted.renderer,
    {
      current: null,
      known: [{ owner: "acme", repo: "isomorph" }],
      lookup: async () => new Map([["acme/isomorph", { title: "A very long title that cannot fit anywhere near this", state: "OPEN", isDraft: false, author: "kim" }]]),
      hasLocalReview: false,
      nothingHere: null,
    },
    () => {}
  )
  await render(tree, mounted.renderer)
  await mounted.mockInput.typeText("12")
  mounted.mockInput.pressEnter()
  await Bun.sleep(0)
  await mounted.renderOnce()
  await mounted.renderOnce()
  const row = trimFrame(mounted.captureCharFrame()).split("\n").find((line) => line.includes("acme/isomorph"))!
  expect(row).toContain("…")
  expect(trimFrame(mounted.captureCharFrame())).not.toContain("near this")
})
