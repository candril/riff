import { test, expect, describe, mock } from "bun:test"
import type { PrCheck } from "../providers/github"
import { fgAt, ints } from "../testing/frame"
import { prInfo } from "../testing/pr-info"
import { find, usePrInfoPanel } from "../testing/pr-info-panel"
import { theme } from "../theme"

// The panel asks for a failing check's annotations and draws what it is
// told; the fetch itself is the app's.

const mount = usePrInfoPanel()

const check = (id: number, name: string, over: Partial<PrCheck> = {}): PrCheck => ({
  id,
  name,
  status: "completed",
  conclusion: "failure",
  detailsUrl: null,
  startedAt: null,
  completedAt: null,
  ...over,
})

const info = () =>
  prInfo("Adds the skill.", {
    checks: [
      check(1, "build", { conclusion: "success" }),
      check(2, "test"),
      check(3, "lint", { annotationsStatus: "error" }),
    ],
  })

/** The checks section with the panel's requests going to a fresh mock. */
async function mountAsking() {
  const asked = mock((_check: PrCheck) => {})
  const mounted = await mount({ section: "checks", info: info(), prepare: (p) => p.setOnOpenFailingCheck(asked) })
  return { ...mounted, asked }
}

describe("a failing check opened", () => {
  test("asks for its annotations once, and not again once they have a status", async () => {
    const { panel, asked } = await mountAsking()
    panel.toggleCheckExpansion(2)
    expect(asked).toHaveBeenCalledTimes(1)
    expect(asked.mock.calls[0]![0].id).toBe(2)

    asked.mock.calls[0]![0].annotationsStatus = "loading"
    panel.toggleCheckExpansion(2)
    panel.toggleCheckExpansion(2)
    expect(asked).toHaveBeenCalledTimes(1)
  })

  test("never asks for a passing check or one whose annotations are settled", async () => {
    const { panel, asked } = await mountAsking()
    panel.toggleCheckExpansion(1)
    panel.toggleCheckExpansion(3)
    expect(asked).not.toHaveBeenCalled()
  })

  test("draws loading, then the annotations, as it is told they changed", async () => {
    const { panel, mounted, asked } = await mountAsking()
    panel.toggleCheckExpansion(2)
    const target = asked.mock.calls[0]![0]

    target.annotationsStatus = "loading"
    panel.checksChanged()
    const loading = (await mounted.frame()).split("\n")
    expect(loading.slice(14, 18)).toEqual([
      "    ✓ build",
      "    ✗ test (failure)  ▼",
      "      Loading annotations…",
      "    ✗ lint (failure)  ▶",
    ])

    target.annotations = [{ path: "src/greet.ts", startLine: 3, endLine: 3, level: "failure", message: "Boom" }]
    target.annotationsStatus = "loaded"
    panel.checksChanged()
    const loaded = (await mounted.frame()).split("\n")
    expect(loaded.slice(14, 19)).toEqual([
      "    ✓ build",
      "    ✗ test (failure)  ▼ [1]",
      "      • src/greet.ts:3",
      "          Boom",
      "    ✗ lint (failure)  ▶",
    ])
    expect(fgAt(mounted.setup.captureSpans(), ...find(loaded, "• src/greet.ts"))).toEqual(ints(theme.red))
  })
})
