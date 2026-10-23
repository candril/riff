import { test, expect } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { createToastState } from "../toast/state"
import { boardLocation, boardPrUrl, openPrInBoard, type BoardLocation } from "./index"

const PR = { owner: "owner", repo: "repo", number: 42 }

function harness(state: AppState, opened: boolean, location: () => BoardLocation | null = () => null) {
  let current = state
  const urls: string[] = []
  const toast = createToastState()
  openPrInBoard({
    getState: () => current,
    setState: (fn) => { current = fn(current) },
    render() {},
    toast,
    openUrl(url) {
      urls.push(url)
      return opened
    },
    boardUrl: "http://localhost:4477",
    location,
  })
  return { urls, toast: toast.current() }
}

const local = createInitialState([], [], "test", "")
const pr = (prInfo: AppState["prInfo"]): AppState => ({ ...local, appMode: "pr", prInfo })
const withPr = pr(PR as unknown as AppState["prInfo"])

test("the board URL is the base, then /pr/owner/repo/number", () => {
  expect(boardPrUrl("http://localhost:4477", PR)).toBe("http://localhost:4477/pr/owner/repo/42")
})

test("the app's link scheme takes the same path, with or without its slashes", () => {
  expect(boardPrUrl("riff-board:", PR)).toBe("riff-board:/pr/owner/repo/42")
  expect(boardPrUrl("riff-board://", PR)).toBe("riff-board:/pr/owner/repo/42")
})

test("a trailing slash on the base does not double up", () => {
  expect(boardPrUrl("http://localhost:4477/", PR)).toBe("http://localhost:4477/pr/owner/repo/42")
})

test("in PR mode the board URL is handed to the browser once", () => {
  const { urls } = harness(withPr, true)
  expect(urls).toEqual(["http://localhost:4477/pr/owner/repo/42"])
})

test("where the reader is goes along as the query", () => {
  const { urls } = harness(withPr, true, () => ({ file: "src/a.ts", line: 3 }))
  expect(urls).toEqual(["http://localhost:4477/pr/owner/repo/42?file=src%2Fa.ts&line=3"])
})

const unreachable = () => {
  throw new Error("asked where the reader is with no PR to open")
}

test("in local mode nothing opens and a notice says why", () => {
  const { urls, toast } = harness(local, true, unreachable)
  expect(urls).toEqual([])
  expect(toast).toEqual({ message: "riff board opens GitHub PRs only", type: "info" })
})

test("in PR mode before the PR has loaded nothing opens and the notice shows", () => {
  const { urls, toast } = harness(pr(null), true, unreachable)
  expect(urls).toEqual([])
  expect(toast?.message).toBe("riff board opens GitHub PRs only")
})

test("a URL the browser could not take shows an error", () => {
  const { toast } = harness(withPr, false)
  expect(toast).toEqual({
    message: "Could not open riff board: http://localhost:4477/pr/owner/repo/42",
    type: "error",
  })
})

const BASE = "http://localhost:4477/pr/owner/repo/42"

test("a file goes in as file= alone", () => {
  expect(boardPrUrl("http://localhost:4477", PR, { file: "src/greet.ts" })).toBe(`${BASE}?file=src%2Fgreet.ts`)
})

test("a line follows the file", () => {
  expect(boardPrUrl("http://localhost:4477", PR, { file: "src/greet.ts", line: 2 })).toBe(
    `${BASE}?file=src%2Fgreet.ts&line=2`,
  )
})

test("an old-side line says so", () => {
  expect(boardPrUrl("http://localhost:4477", PR, { file: "src/greet.ts", line: 2, side: "old" })).toBe(
    `${BASE}?file=src%2Fgreet.ts&line=2&side=old`,
  )
})

test("the path is percent-encoded, a space as %20 and not +", () => {
  expect(boardPrUrl("http://localhost:4477/", PR, { file: "src/a b.ts" })).toBe(`${BASE}?file=src%2Fa%20b.ts`)
})

test("no location leaves the bare PR path", () => {
  expect(boardPrUrl("http://localhost:4477", PR, null)).toBe(BASE)
})

const inDiff = (patch: Partial<AppState> = {}): AppState => ({ ...withPr, viewMode: "diff", focusedPanel: "diff", ...patch })

test("an added or context line in the diff sends its new-side line", () => {
  expect(boardLocation(inDiff(), { filename: "a.ts", line: 4, side: "RIGHT" })).toEqual({ file: "a.ts", line: 4 })
  expect(boardLocation(inDiff(), { filename: "a.ts", line: 1, side: "RIGHT" })).toEqual({ file: "a.ts", line: 1 })
})

test("a removed line in the diff sends its old-side line", () => {
  expect(boardLocation(inDiff(), { filename: "a.ts", line: 2, side: "LEFT" })).toEqual({
    file: "a.ts",
    line: 2,
    side: "old",
  })
})

test("a diff row with no line, a header or a divider, sends the file", () => {
  expect(boardLocation(inDiff(), { filename: "a.ts" })).toEqual({ file: "a.ts" })
})

test("a file row in the tree sends the file without a line", () => {
  expect(boardLocation(inDiff({ focusedPanel: "tree" }), { filename: "a.ts" })).toEqual({ file: "a.ts" })
})

test("a directory row in the tree sends nothing", () => {
  expect(boardLocation(inDiff({ focusedPanel: "tree" }), null)).toBeNull()
})

test("the overview, the feed and the thread panel send nothing, whatever file the resolver found", () => {
  const target = { filename: "a.ts", line: 4, side: "RIGHT" as const }
  expect(boardLocation(inDiff({ viewMode: "state" }), target)).toBeNull()
  expect(boardLocation(inDiff({ viewMode: "feed" }), target)).toBeNull()
  expect(boardLocation(inDiff({ viewMode: "state", focusedPanel: "tree" }), { filename: "a.ts" })).toBeNull()
  expect(boardLocation(inDiff({ focusedPanel: "comments" }), target)).toBeNull()
})
