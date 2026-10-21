import { describe, expect, mock, test } from "bun:test"
import type { PrCheck, PrCheckAnnotation } from "../../providers/github/types"
import { loadCheckAnnotations, openFailingCheck } from "./check-annotations"

const failing = (): PrCheck => ({
  id: 7,
  name: "test",
  status: "completed",
  conclusion: "failure",
  startedAt: null,
  completedAt: null,
  detailsUrl: null,
})

const annotation: PrCheckAnnotation = {
  path: "src/greet.ts",
  startLine: 12,
  endLine: 12,
  level: "failure",
  message: "Expected 2, got 3",
}

describe("loadCheckAnnotations", () => {
  test("says it is loading, then hands over what it fetched", async () => {
    const check = failing()
    const seen: (PrCheck["annotationsStatus"])[] = []
    await loadCheckAnnotations(check, async () => [annotation], () => seen.push(check.annotationsStatus))
    expect(seen).toEqual(["loading", "loaded"])
    expect(check.annotations).toEqual([annotation])
  })

  test("says it is loading before the fetch has even started", () => {
    const check = failing()
    const seen: (PrCheck["annotationsStatus"])[] = []
    void loadCheckAnnotations(check, () => new Promise(() => {}), () => seen.push(check.annotationsStatus))
    expect(seen).toEqual(["loading"])
  })

  test("says the fetch failed when it throws", async () => {
    const check = failing()
    const seen: (PrCheck["annotationsStatus"])[] = []
    await loadCheckAnnotations(
      check,
      async () => {
        throw new Error("gh is down")
      },
      () => seen.push(check.annotationsStatus)
    )
    expect(seen).toEqual(["loading", "error"])
    expect(check.annotations).toBeUndefined()
  })
})

describe("openFailingCheck", () => {
  test("tells the panel current when the fetch settles, not the one current when it started", async () => {
    const check = failing()
    const a = { checksChanged: mock(() => {}) }
    const b = { checksChanged: mock(() => {}) }
    const render = mock(() => {})
    let current: typeof a | null = a
    let resolve!: (annotations: PrCheckAnnotation[]) => void

    const opened = openFailingCheck(check, {
      fetch: () => new Promise((r) => (resolve = r)),
      currentPanel: () => current,
      render,
    })
    a.checksChanged.mockClear()
    render.mockClear()

    current = b
    resolve([annotation])
    await opened

    expect(check.annotationsStatus).toBe("loaded")
    expect(b.checksChanged).toHaveBeenCalledTimes(1)
    expect(a.checksChanged).not.toHaveBeenCalled()
    expect(render).toHaveBeenCalledTimes(1)
  })

  test("still renders when no panel is left to tell", async () => {
    const render = mock(() => {})
    await openFailingCheck(failing(), { fetch: async () => [annotation], currentPanel: () => null, render })
    expect(render).toHaveBeenCalledTimes(2)
  })
})
