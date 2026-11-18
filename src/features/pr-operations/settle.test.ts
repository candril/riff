import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import type { PrInfo } from "../../providers/github/types"
import { prInfo } from "../../testing/pr-info"
import { createPrInfoSettler } from "./settle"

function harness(delays: number[] = [0, 3_000, 10_000]) {
  const pr = prInfo("", { owner: "owner", repo: "repo", number: 1259 })
  let state: AppState = { ...createInitialState([], [], "gh:owner/repo#1259", ""), appMode: "pr", prInfo: pr }
  const fetched: string[] = []
  const pending: { ms: number; fn: () => void; cancelled: boolean }[] = []
  let renders = 0
  let answer: (n: number) => Promise<PrInfo> = async (n) => ({ ...state.prInfo!, title: `fetch ${n}` })
  const settler = createPrInfoSettler({
    fetchPrInfo: async (owner, repo, n) => {
      fetched.push(`${owner}/${repo}#${n}`)
      return answer(fetched.length)
    },
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render: () => { renders++ },
    later: (fn, ms) => {
      const timer = { ms, fn, cancelled: false }
      pending.push(timer)
      return () => { timer.cancelled = true }
    },
  }, delays)
  return {
    pr,
    settler,
    fetched,
    pending,
    renders: () => renders,
    state: () => state,
    setState: (next: AppState) => { state = next },
    answerWith: (fn: (n: number) => Promise<PrInfo>) => { answer = fn },
    fire: (ms: number) => {
      for (const timer of pending) if (timer.ms === ms && !timer.cancelled) timer.fn()
    },
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe("the PR info settler", () => {
  test("fetches at once and again on each later rung, patching each answer in", async () => {
    const h = harness()
    h.settler.settle(h.pr)
    await tick()
    expect(h.fetched).toEqual(["owner/repo#1259"])
    expect(h.state().prInfo!.title).toBe("fetch 1")
    expect(h.pending.map((t) => t.ms)).toEqual([3_000, 10_000])

    h.fire(3_000)
    await tick()
    expect(h.state().prInfo!.title).toBe("fetch 2")
    h.fire(10_000)
    await tick()
    expect(h.state().prInfo!.title).toBe("fetch 3")
    expect(h.renders()).toBe(3)
  })

  test("\"later\" leaves the immediate fetch to the action that just made one", async () => {
    const h = harness()
    h.settler.settle(h.pr, "later")
    await tick()
    expect(h.fetched).toEqual([])
    expect(h.pending.map((t) => t.ms)).toEqual([3_000, 10_000])
  })

  test("a second action starts the ladder over", async () => {
    const h = harness()
    h.settler.settle(h.pr, "later")
    h.settler.settle(h.pr, "later")
    expect(h.pending.filter((t) => !t.cancelled).map((t) => t.ms)).toEqual([3_000, 10_000])
    expect(h.pending.filter((t) => t.cancelled)).toHaveLength(2)
  })

  test("an answer asked before prInfo moved is dropped", async () => {
    const h = harness()
    let release!: () => void
    h.answerWith(() => new Promise((r) => { release = () => r({ ...h.pr, title: "stale" }) }))
    h.settler.settle(h.pr)
    const patched = { ...h.pr, title: "optimistic" }
    h.setState({ ...h.state(), prInfo: patched })
    release()
    await tick()
    expect(h.state().prInfo).toBe(patched)
    expect(h.renders()).toBe(0)
  })

  test("a rung that fires once riff shows another PR asks nothing", async () => {
    const h = harness()
    h.settler.settle(h.pr, "later")
    h.setState({ ...h.state(), prInfo: prInfo("", { owner: "owner", repo: "repo", number: 77 }) })
    h.fire(3_000)
    await tick()
    expect(h.fetched).toEqual([])
  })

  test("a fetch that fails changes nothing", async () => {
    const h = harness()
    h.answerWith(() => Promise.reject(new Error("offline")))
    const before = h.state()
    h.settler.settle(h.pr)
    await tick()
    expect(h.state()).toBe(before)
  })
})
