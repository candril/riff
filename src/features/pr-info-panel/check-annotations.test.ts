import { describe, expect, test } from "bun:test"
import type { PrCheck, PrCheckAnnotation } from "../../providers/github"
import { loadCheckAnnotations } from "./check-annotations"

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
