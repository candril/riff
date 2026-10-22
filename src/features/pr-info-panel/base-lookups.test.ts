import { describe, expect, test } from "bun:test"
import { createBaseLookups, type BaseLookupTarget } from "./base-lookups"
import { createBaseLookupsState } from "./base-lookups-state"
import type { BehindBy } from "../../components/merge-status-model"
import type { StackInfo } from "../../utils/stack"

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

type PanelCall = ["setStack", StackInfo | null] | ["setBehindBy", BehindBy]

function fakePanel() {
  const calls: PanelCall[] = []
  return {
    calls,
    stackCalls: () => calls.filter((call) => call[0] === "setStack").map((call) => call[1]),
    behindCalls: () => calls.filter((call) => call[0] === "setBehindBy").map((call) => call[1]),
    setStack(stack: StackInfo | null) { calls.push(["setStack", stack]) },
    setBehindBy(behindBy: BehindBy) { calls.push(["setBehindBy", behindBy]) },
  }
}

const stackOn = (number: number, status: StackInfo["status"] = "current"): StackInfo => ({
  basePr: { number, title: `#${number}` },
  status,
  behindBy: 1,
})

function harness() {
  const stackAsks: Deferred<StackInfo | null>[] = []
  const behindAsks: Deferred<number | "failed">[] = []
  const rewritten: StackInfo[] = []
  let panel = fakePanel()
  let renders = 0
  let target: BaseLookupTarget | null = { owner: "o", repo: "r", baseRef: "main", headSha: "abc", key: "o/r#1 main...abc" }
  const state = createBaseLookupsState()
  const lookups = createBaseLookups({
    state,
    target: () => target,
    fetchStack: () => {
      const ask = deferred<StackInfo | null>()
      stackAsks.push(ask)
      return ask.promise
    },
    fetchBehindBy: () => {
      const ask = deferred<number | "failed">()
      behindAsks.push(ask)
      return ask.promise
    },
    panel: () => panel,
    onRewritten: (stack) => rewritten.push(stack),
    render: () => { renders++ },
  })
  return {
    state,
    lookups,
    rewritten,
    answerStack(ask: number, stack: StackInfo | null) {
      stackAsks[ask]!.resolve(stack)
    },
    answerBehindBy(ask: number, behindBy: number | "failed") {
      behindAsks[ask]!.resolve(behindBy)
    },
    get panel() { return panel },
    get renders() { return renders },
    /** A rebuild hands the lookups a fresh panel, as the poll does. */
    rebuild(reread: boolean) {
      panel = fakePanel()
      lookups.wire(panel, { reread })
      return panel
    },
    moveHead(headSha: string) {
      target = { ...target!, headSha, key: `o/r#1 main...${headSha}` }
    },
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("the base lookups", () => {
  test("a newer read's answer stays when the older one answers last", async () => {
    const h = harness()
    h.rebuild(true)
    const panel = h.rebuild(true)
    h.answerStack(1, stackOn(2))
    h.answerBehindBy(1, 4)
    await settle()
    h.answerStack(0, stackOn(1))
    h.answerBehindBy(0, 9)
    await settle()
    expect(h.state.stack()).toEqual(stackOn(2))
    expect(h.state.behindBy()).toBe(4)
    expect(panel.stackCalls()).toEqual([stackOn(2)])
    expect(panel.behindCalls()).toEqual([null, 4])
  })

  test("a rebuild that does not ask again while the first stack read is out hands the panel no null", async () => {
    const h = harness()
    h.rebuild(true)
    const rebuilt = h.rebuild(false)
    expect(rebuilt.stackCalls()).toEqual([])
    h.answerStack(0, stackOn(3))
    await settle()
    expect(rebuilt.stackCalls()).toEqual([stackOn(3)])
  })

  test("a rebuild that does not ask again takes a heard null as the answer", async () => {
    const h = harness()
    h.rebuild(true)
    h.answerStack(0, null)
    await settle()
    const rebuilt = h.rebuild(false)
    expect(rebuilt.stackCalls()).toEqual([null])
  })

  test("a rebuild that does not ask again seeds the behind count it holds", async () => {
    const h = harness()
    h.rebuild(true)
    expect(h.rebuild(false).behindCalls()).toEqual([null])
    h.answerBehindBy(0, "failed")
    await settle()
    expect(h.rebuild(false).behindCalls()).toEqual(["failed"])
  })

  test("a rebuild that asks again forgets what was heard", async () => {
    const h = harness()
    h.rebuild(true)
    h.answerStack(0, stackOn(1))
    h.answerBehindBy(0, 2)
    await settle()
    const panel = h.rebuild(true)
    expect(h.state.stack()).toBeNull()
    expect(h.state.stackHeard()).toBe(false)
    expect(panel.calls).toEqual([["setBehindBy", null]])
  })

  test("an answer out when wire forgets never reaches the panel", async () => {
    const h = harness()
    h.rebuild(true)
    const panel = h.rebuild(true)
    h.answerStack(0, stackOn(1))
    h.answerBehindBy(0, 7)
    await settle()
    expect(panel.calls).toEqual([["setBehindBy", null]])
    expect(h.renders).toBe(0)
  })

  test("drops an answer whose head moved while it was out", async () => {
    const h = harness()
    const panel = h.rebuild(true)
    h.moveHead("def")
    h.answerStack(0, stackOn(1))
    await settle()
    expect(panel.stackCalls()).toEqual([])
    expect(h.state.stackHeard()).toBe(false)
  })

  // Every answer readStack takes follows a forget(), so each one is news.
  test("announces every rewritten base it takes, and none a newer ask overtook", async () => {
    const h = harness()
    h.rebuild(true)
    h.rebuild(true)
    h.answerStack(1, stackOn(1, "rewritten"))
    await settle()
    expect(h.rewritten).toEqual([stackOn(1, "rewritten")])

    h.answerStack(0, stackOn(2, "rewritten"))
    await settle()
    h.rebuild(false)
    expect(h.rewritten).toEqual([stackOn(1, "rewritten")])

    h.rebuild(true)
    h.answerStack(2, stackOn(3, "rewritten"))
    await settle()
    expect(h.rewritten).toEqual([stackOn(1, "rewritten"), stackOn(3, "rewritten")])
  })
})
