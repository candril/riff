import { test, expect } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { boardPrUrl, openPrInBoard } from "./index"

const PR = { owner: "owner", repo: "repo", number: 42 }

function harness(state: AppState, opened: boolean) {
  let current = state
  const urls: string[] = []
  openPrInBoard({
    getState: () => current,
    setState: (fn) => { current = fn(current) },
    render() {},
    openUrl(url) {
      urls.push(url)
      return opened
    },
    boardUrl: "http://localhost:4477",
  })
  return { urls, toast: current.toast }
}

const local = createInitialState([], [], "test", "")
const pr = (prInfo: AppState["prInfo"]): AppState => ({ ...local, appMode: "pr", prInfo })
const withPr = pr(PR as unknown as AppState["prInfo"])

test("the board URL is the base, then /pr/owner/repo/number", () => {
  expect(boardPrUrl("http://localhost:4477", PR)).toBe("http://localhost:4477/pr/owner/repo/42")
})

test("a trailing slash on the base does not double up", () => {
  expect(boardPrUrl("http://localhost:4477/", PR)).toBe("http://localhost:4477/pr/owner/repo/42")
})

test("in PR mode the board URL is handed to the browser once", () => {
  const { urls } = harness(withPr, true)
  expect(urls).toEqual(["http://localhost:4477/pr/owner/repo/42"])
})

test("in local mode nothing opens and a notice says why", () => {
  const { urls, toast } = harness(local, true)
  expect(urls).toEqual([])
  expect(toast).toEqual({ message: "riff board opens GitHub PRs only", type: "info" })
})

test("in PR mode before the PR has loaded nothing opens and the notice shows", () => {
  const { urls, toast } = harness(pr(null), true)
  expect(urls).toEqual([])
  expect(toast.message).toBe("riff board opens GitHub PRs only")
})

test("a URL the browser could not take shows an error", () => {
  const { toast } = harness(withPr, false)
  expect(toast).toEqual({
    message: "Could not open riff board: http://localhost:4477/pr/owner/repo/42",
    type: "error",
  })
})
